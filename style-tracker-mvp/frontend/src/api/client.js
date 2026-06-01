import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:8000',
})

// ── Cases ──────────────────────────────────────────────────────────────────

export const listCases = () => api.get('/cases/').then(r => r.data)

export const getCase = (styleNumber) =>
  api.get(`/cases/${encodeURIComponent(styleNumber)}`).then(r => r.data)

export const createCase = (file) => {
  const form = new FormData()
  form.append('file', file)
  return api.post('/cases/', form).then(r => r.data)
}

export const verifyCase = (styleNumber, payload) =>
  api.patch(`/cases/${encodeURIComponent(styleNumber)}/verify`, payload).then(r => r.data)

export const getFinancials = (styleNumber) =>
  api.get(`/cases/${encodeURIComponent(styleNumber)}/financials`).then(r => r.data)

export const updateLifecycle = (styleNumber, lifecycle_status) =>
  api.patch(`/cases/${encodeURIComponent(styleNumber)}/lifecycle`, null, {
    params: { lifecycle_status },
  }).then(r => r.data)

// ── Suppliers ──────────────────────────────────────────────────────────────

export const listSuppliers = (styleNumber) =>
  api.get(`/cases/${encodeURIComponent(styleNumber)}/suppliers/`).then(r => r.data)

export const createSupplier = (styleNumber, payload) =>
  api.post(`/cases/${encodeURIComponent(styleNumber)}/suppliers/`, payload).then(r => r.data)

// ── Supplier POs ───────────────────────────────────────────────────────────

export const listSupplierPOs = (styleNumber, supplierId) =>
  api.get(`/cases/${encodeURIComponent(styleNumber)}/suppliers/${supplierId}/pos`).then(r => r.data)

export const uploadSupplierPO = (styleNumber, supplierId, file) => {
  const form = new FormData()
  form.append('file', file)
  return api.post(
    `/cases/${encodeURIComponent(styleNumber)}/suppliers/${supplierId}/pos`,
    form,
  ).then(r => r.data)
}

export const getSupplierPO = (styleNumber, supplierId, poId) =>
  api.get(`/cases/${encodeURIComponent(styleNumber)}/suppliers/${supplierId}/pos/${poId}`).then(r => r.data)

export const verifySupplierPO = (styleNumber, supplierId, poId, payload) =>
  api.patch(
    `/cases/${encodeURIComponent(styleNumber)}/suppliers/${supplierId}/pos/${poId}/verify`,
    payload,
  ).then(r => r.data)

// ── GRNs ───────────────────────────────────────────────────────────────────

export const listGRNs = (styleNumber, supplierId, poId) =>
  api.get(`/cases/${encodeURIComponent(styleNumber)}/suppliers/${supplierId}/pos/${poId}/grns`).then(r => r.data)

export const uploadGRN = (styleNumber, supplierId, poId, file) => {
  const form = new FormData()
  form.append('file', file)
  return api.post(
    `/cases/${encodeURIComponent(styleNumber)}/suppliers/${supplierId}/pos/${poId}/grns/upload`,
    form,
  ).then(r => r.data)
}

export const getGRN = (styleNumber, supplierId, poId, grnId) =>
  api.get(`/cases/${encodeURIComponent(styleNumber)}/suppliers/${supplierId}/pos/${poId}/grns/${grnId}`).then(r => r.data)

export const verifyGRN = (styleNumber, supplierId, poId, grnId, payload) =>
  api.patch(
    `/cases/${encodeURIComponent(styleNumber)}/suppliers/${supplierId}/pos/${poId}/grns/${grnId}/verify`,
    payload,
  ).then(r => r.data)

export const ingestDetailedGRN = (styleNumber, supplierId, poId, file) => {
  const form = new FormData()
  form.append('file', file)
  return api.post(
    `/cases/${encodeURIComponent(styleNumber)}/suppliers/${supplierId}/pos/${poId}/grns`,
    form,
  ).then(r => r.data)
}

// ── Invoices ───────────────────────────────────────────────────────────────

export const listInvoices = (styleNumber, supplierId) =>
  api.get(`/cases/${encodeURIComponent(styleNumber)}/suppliers/${supplierId}/invoices`).then(r => r.data)

export const getSupplierInvoice = (styleNumber, supplierId, invoiceId) =>
  api.get(`/cases/${encodeURIComponent(styleNumber)}/suppliers/${supplierId}/invoices/${invoiceId}`).then(r => r.data)

export const uploadInvoice = (styleNumber, supplierId, file) => {
  const form = new FormData()
  form.append('file', file)
  return api.post(
    `/cases/${encodeURIComponent(styleNumber)}/suppliers/${supplierId}/invoices/upload`,
    form,
  ).then(r => r.data)
}

export const verifyInvoice = (styleNumber, supplierId, invoiceId, payload) =>
  api.patch(
    `/cases/${encodeURIComponent(styleNumber)}/suppliers/${supplierId}/invoices/${invoiceId}/verify`,
    payload,
  ).then(r => r.data)
