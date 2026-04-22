const { query } = require('../config/database');
const { success, error } = require('../utils/response');
const { paginate } = require('../utils/helpers');
const logger = require('../utils/logger');

// ── Service Autocomplete ──────────────────────────────────────────
exports.autocomplete = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 1) {
      return success(res, [], 'No query');
    }

    const result = await query(
      `SELECT id, name, slug, category, usage_count
       FROM services
       WHERE is_approved = TRUE
       AND (
         name ILIKE $1
         OR slug ILIKE $1
         OR name ILIKE $2
       )
       ORDER BY usage_count DESC, name ASC
       LIMIT 15`,
      [`${q}%`, `%${q}%`]
    );

    return success(res, result.rows, 'Services found');
  } catch (err) {
    logger.error('Autocomplete error', err);
    return error(res, 'Search failed');
  }
};

// ── Search Vendors ────────────────────────────────────────────────
exports.searchVendors = async (req, res) => {
  try {
    const {
      service_id,
      lat, lng,
      max_distance_km = 20,
      available_now,
      verified_only,
      min_rating,
      max_price,
      min_price,
      page = 1,
      limit = 20
    } = req.query;

    if (!service_id) return error(res, 'service_id is required', 400);
    if (!lat || !lng) return error(res, 'Location coordinates required', 400);

    const { offset } = paginate(page, limit);

    // Build dynamic WHERE clauses
    const conditions = [
      `vp.status = 'active'`,
      `vp.kyc_status = 'approved'`,
      `vs.service_id = $1`,
      `ST_DWithin(
        ST_SetSRID(ST_MakePoint(vp.location_lng, vp.location_lat), 4326)::geography,
        ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography,
        $4 * 1000
      )`
    ];

    const params = [service_id, parseFloat(lat), parseFloat(lng), parseFloat(max_distance_km)];
    let paramIdx = 5;

    if (available_now === 'true') {
      conditions.push(`vp.is_available_now = TRUE`);
    }

    if (verified_only === 'true') {
      conditions.push(`vp.verified_at IS NOT NULL`);
    }

    if (min_rating) {
      conditions.push(`vp.avg_rating >= $${paramIdx}`);
      params.push(parseFloat(min_rating));
      paramIdx++;
    }

    if (max_price) {
      conditions.push(`(vp.price_min IS NULL OR vp.price_min <= $${paramIdx})`);
      params.push(parseInt(max_price));
      paramIdx++;
    }

    const whereClause = conditions.join(' AND ');

    const result = await query(
      `SELECT
         u.id, u.full_name, u.profile_photo_url,
         vp.business_name, vp.avg_rating, vp.total_reviews, vp.total_jobs,
         vp.price_min, vp.price_max, vp.price_negotiable,
         vp.location_area, vp.availability_text,
         vp.is_available_now, vp.verified_at IS NOT NULL as is_verified,
         vp.response_rate,
         ST_Distance(
           ST_SetSRID(ST_MakePoint(vp.location_lng, vp.location_lat), 4326)::geography,
           ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography
         ) / 1000 as distance_km,
         (SELECT array_agg(s.name ORDER BY s.name)
          FROM vendor_services vs2
          JOIN services s ON s.id = vs2.service_id
          WHERE vs2.vendor_id = vp.id) as service_tags,
         (SELECT pi.image_url FROM portfolio_images pi
          WHERE pi.vendor_id = vp.id AND pi.is_cover = TRUE LIMIT 1) as cover_image
       FROM users u
       JOIN vendor_profiles vp ON vp.user_id = u.id
       JOIN vendor_services vs ON vs.vendor_id = vp.id
       WHERE ${whereClause}
       ORDER BY distance_km ASC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, parseInt(limit), offset]
    );

    // Increment service usage count
    await query(
      'UPDATE services SET usage_count = usage_count + 1 WHERE id = $1',
      [service_id]
    );

    return success(res, {
      vendors: result.rows,
      page: parseInt(page),
      limit: parseInt(limit),
      total: result.rows.length,
    }, 'Vendors found');
  } catch (err) {
    logger.error('Search vendors error', err);
    return error(res, 'Search failed');
  }
};

// ── Get Vendor Profile ────────────────────────────────────────────
exports.getVendorProfile = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { lat, lng } = req.query;

    const result = await query(
      `SELECT
         u.id, u.full_name, u.profile_photo_url, u.created_at as member_since,
         vp.business_name, vp.bio, vp.avg_rating, vp.total_reviews, vp.total_jobs,
         vp.price_min, vp.price_max, vp.price_negotiable,
         vp.location_area, vp.location_type,
         vp.availability_text, vp.available_days, vp.available_from, vp.available_to,
         vp.is_available_now, vp.service_radius_km,
         vp.verified_at IS NOT NULL as is_verified, vp.verified_at,
         vp.response_rate, vp.completion_rate,
         ${lat && lng ? `
         ST_Distance(
           ST_SetSRID(ST_MakePoint(vp.location_lng, vp.location_lat), 4326)::geography,
           ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography
         ) / 1000 as distance_km,` : ''}
         (SELECT json_agg(json_build_object('id', s.id, 'name', s.name, 'slug', s.slug))
          FROM vendor_services vs
          JOIN services s ON s.id = vs.service_id
          WHERE vs.vendor_id = vp.id) as services,
         (SELECT json_agg(json_build_object(
           'id', pi.id, 'url', pi.image_url,
           'is_cover', pi.is_cover, 'position', pi.position
         ) ORDER BY pi.position)
          FROM portfolio_images pi WHERE pi.vendor_id = vp.id) as portfolio
       FROM users u
       JOIN vendor_profiles vp ON vp.user_id = u.id
       WHERE u.id = $1 AND vp.status = 'active' AND vp.kyc_status = 'approved'`,
      lat && lng ? [vendorId, parseFloat(lng), parseFloat(lat)] : [vendorId]
    );

    if (!result.rows[0]) {
      return error(res, 'Vendor not found', 404);
    }

    // Fetch recent reviews separately
    const reviews = await query(
      `SELECT r.rating, r.comment, r.created_at,
              u.full_name as customer_name, u.profile_photo_url as customer_photo
       FROM reviews r
       JOIN users u ON u.id = r.customer_id
       WHERE r.vendor_id = $1
       ORDER BY r.created_at DESC LIMIT 10`,
      [vendorId]
    );

    return success(res, {
      vendor: result.rows[0],
      reviews: reviews.rows,
    }, 'Vendor profile retrieved');
  } catch (err) {
    logger.error('Get vendor profile error', err);
    return error(res, 'Failed to get vendor profile');
  }
};

// ── Get All Approved Services ─────────────────────────────────────
exports.getAllServices = async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, slug, category, usage_count
       FROM services WHERE is_approved = TRUE
       ORDER BY category ASC, usage_count DESC, name ASC`
    );
    return success(res, result.rows, 'Services retrieved');
  } catch (err) {
    return error(res, 'Failed to get services');
  }
};
