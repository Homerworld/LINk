const ok = (res, data = {}, message = 'Success', code = 200) =>
  res.status(code).json({ success: true, message, data });

const fail = (res, message = 'Something went wrong', code = 500, errors = null) => {
  const body = { success: false, message };
  if (errors) body.errors = errors;
  return res.status(code).json(body);
};

module.exports = { ok, fail };
