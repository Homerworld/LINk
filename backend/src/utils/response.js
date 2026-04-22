const success = (res, data = {}, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({ success: true, message, data });
};

const created = (res, data = {}, message = 'Created successfully') => {
  return res.status(201).json({ success: true, message, data });
};

const error = (res, message = 'Something went wrong', statusCode = 500, errors = null) => {
  const response = { success: false, message };
  if (errors) response.errors = errors;
  return res.status(statusCode).json(response);
};

const notFound = (res, message = 'Resource not found') => {
  return res.status(404).json({ success: false, message });
};

const unauthorized = (res, message = 'Unauthorized') => {
  return res.status(401).json({ success: false, message });
};

const forbidden = (res, message = 'Forbidden') => {
  return res.status(403).json({ success: false, message });
};

const validationError = (res, errors) => {
  return res.status(422).json({ success: false, message: 'Validation failed', errors });
};

module.exports = { success, created, error, notFound, unauthorized, forbidden, validationError };
