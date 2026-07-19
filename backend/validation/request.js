function formatZodError(error) {
  return error.issues.map(issue => ({
    path: issue.path.join('.'),
    message: issue.message
  }));
}

function parseBody(schema, req, res) {
  const parsed = schema.safeParse(req.body || {});
  if (parsed.success) return parsed.data;
  res.status(400).json({
    success: false,
    error: 'Payload inválido',
    details: formatZodError(parsed.error)
  });
  return null;
}

function parseQuery(schema, req, res) {
  const parsed = schema.safeParse(req.query || {});
  if (parsed.success) return parsed.data;
  res.status(400).json({
    success: false,
    error: 'Query inválida',
    details: formatZodError(parsed.error)
  });
  return null;
}

module.exports = {
  formatZodError,
  parseBody,
  parseQuery
};
