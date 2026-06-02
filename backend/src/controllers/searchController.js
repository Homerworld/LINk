const { query } = require('../config/database');
const { success, error } = require('../utils/response');

// GET /api/search/vendors
exports.searchVendors = async (req, res) => {
  try {
    const { service, lat, lng, radius = 20, limit = 20, offset = 0 } = req.query;

    let sql = `
      SELECT
        u.id, u.full_name,
        vp.id AS vendor_profile_id,
        vp.location_area, vp.location_type,
        vp.avg_rating, vp.total_reviews, vp.total_jobs,
        vp.price_min, vp.price_max, vp.price_negotiable,
        vp.availability_text, vp.is_online,
        vp.latitude, vp.longitude,
        array_agg(DISTINCT s.name) FILTER (WHERE s.name IS NOT NULL) AS services,
        pi.image_url AS cover_image
    `;

    if (lat && lng) {
      sql += `,
        (6371 * acos(cos(radians($1)) * cos(radians(vp.latitude)) *
        cos(radians(vp.longitude) - radians($2)) +
        sin(radians($1)) * sin(radians(vp.latitude)))) AS distance_km
      `;
    }

    sql += `
      FROM users u
      JOIN vendor_profiles vp ON vp.user_id = u.id
      LEFT JOIN vendor_services vs ON vs.vendor_profile_id = vp.id
      LEFT JOIN services s ON s.id = vs.service_id
      LEFT JOIN LATERAL (
        SELECT image_url FROM portfolio_images
        WHERE vendor_profile_id = vp.id
        ORDER BY display_order ASC LIMIT 1
      ) pi ON TRUE
      WHERE vp.kyc_status = 'approved' AND u.is_active = TRUE
    `;

    const params = [];
    let paramIdx = 1;

    if (lat && lng) {
      params.push(lat, lng);
      paramIdx = 3;
    }

    if (service) {
      sql += ` AND s.name ILIKE $${paramIdx}`;
      params.push(`%${service}%`);
      paramIdx++;
    }

    sql += ` GROUP BY u.id, u.full_name, vp.id, pi.image_url`;

    if (lat && lng) {
      sql += ` HAVING (6371 * acos(cos(radians($1)) * cos(radians(vp.latitude)) *
        cos(radians(vp.longitude) - radians($2)) +
        sin(radians($1)) * sin(radians(vp.latitude)))) < $${paramIdx}`;
      params.push(parseFloat(radius));
      paramIdx++;
      sql += ` ORDER BY distance_km ASC`;
    } else {
      sql += ` ORDER BY vp.avg_rating DESC, vp.total_jobs DESC`;
    }

    sql += ` LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await query(sql, params);

    return success(res, result.rows);
  } catch (err) {
    return error(res, 'Search failed: ' + err.message);
  }
};

// GET /api/search/autocomplete
exports.autocomplete = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return success(res, []);

    const result = await query(
      `SELECT DISTINCT name, category FROM services
       WHERE name ILIKE $1 AND is_active = TRUE
       ORDER BY name LIMIT 10`,
      [`%${q}%`]
    );

    return success(res, result.rows);
  } catch (err) {
    return error(res, 'Autocomplete failed');
  }
};

// GET /api/search/vendor/:id
exports.getVendorProfile = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT
        u.id, u.full_name,
        vp.id AS vendor_profile_id,
        vp.location_area, vp.location_type, vp.latitude, vp.longitude,
        vp.avg_rating, vp.total_reviews, vp.total_jobs, vp.completion_rate,
        vp.price_min, vp.price_max, vp.price_negotiable,
        vp.availability_text, vp.available_days, vp.is_online,
        array_agg(DISTINCT jsonb_build_object('id', s.id, 'name', s.name, 'category', s.category))
          FILTER (WHERE s.id IS NOT NULL) AS services,
        array_agg(DISTINCT pi.image_url) FILTER (WHERE pi.image_url IS NOT NULL) AS portfolio
       FROM users u
       JOIN vendor_profiles vp ON vp.user_id = u.id
       LEFT JOIN vendor_services vs ON vs.vendor_profile_id = vp.id
       LEFT JOIN services s ON s.id = vs.service_id
       LEFT JOIN portfolio_images pi ON pi.vendor_profile_id = vp.id
       WHERE u.id = $1 AND vp.kyc_status = 'approved'
       GROUP BY u.id, u.full_name, vp.id`,
      [id]
    );

    if (result.rows.length === 0) return error(res, 'Vendor not found', 404);

    return success(res, result.rows[0]);
  } catch (err) {
    return error(res, 'Failed to get vendor profile');
  }
};

// GET /api/search/services
exports.getServices = async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, category FROM services WHERE is_active = TRUE ORDER BY category, name`
    );
    return success(res, result.rows);
  } catch (err) {
    return error(res, 'Failed to get services');
  }
};
