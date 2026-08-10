const {
  createComplaint,
  findComplaintStatus,
  listComplaints,
  respondComplaint,
  extendComplaint,
} = require('../services/complaint.service');

const create = async (req, res) => {
  const result = await createComplaint(req.body || {}, req);
  return res.status(201).json({
    message: 'Tu hoja de reclamación fue registrada.',
    ...result,
  });
};

const status = async (req, res) => {
  const complaint = await findComplaintStatus(req.query || {});
  return res.status(200).json(complaint);
};

const list = async (req, res) => {
  const result = await listComplaints(req.query || {});
  return res.status(200).json(result);
};

const respond = async (req, res) => {
  const complaint = await respondComplaint(req.params.id, req.body || {}, req);
  return res.status(200).json({ message: 'Respuesta registrada.', complaint });
};

const extend = async (req, res) => {
  const complaint = await extendComplaint(req.params.id);
  return res.status(200).json({ message: 'Plazo ampliado.', complaint });
};

module.exports = { create, status, list, respond, extend };
