import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import StyleRoom from './pages/StyleRoom'
import VerifyCase from './pages/VerifyCase'
import SupplierRoom from './pages/SupplierRoom'
import VerifySupplierPO from './pages/VerifySupplierPO'
import VerifyGRN from './pages/VerifyGRN'
import GRNEntry from './pages/GRNEntry'
import DebitNote from './pages/DebitNote'
import VerifyInvoice from './pages/VerifyInvoice'

export default function App() {
  const GRN_BASE = '/cases/:styleNumber/suppliers/:supplierId/pos/:poId/grns/:grnId'
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/cases/:styleNumber" element={<StyleRoom />} />
        <Route path="/cases/:styleNumber/verify" element={<VerifyCase />} />
        <Route path="/cases/:styleNumber/suppliers/:supplierId" element={<SupplierRoom />} />
        <Route path="/cases/:styleNumber/suppliers/:supplierId/pos/:poId/verify" element={<VerifySupplierPO />} />
        {/* 3-screen GRN flow */}
        <Route path={`${GRN_BASE}/challan`} element={<VerifyGRN />} />
        <Route path={`${GRN_BASE}/grn-entry`} element={<GRNEntry />} />
        <Route path={`${GRN_BASE}/debit-note`} element={<DebitNote />} />
        {/* Legacy route — old-style GRNs uploaded via /grns/upload */}
        <Route path={`${GRN_BASE}/verify`} element={<VerifyGRN />} />
        <Route path="/cases/:styleNumber/suppliers/:supplierId/invoices/:invoiceId/verify" element={<VerifyInvoice />} />
      </Routes>
    </BrowserRouter>
  )
}
