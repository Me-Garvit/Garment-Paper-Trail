import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import StyleRoom from './pages/StyleRoom'
import VerifyCase from './pages/VerifyCase'
import SupplierRoom from './pages/SupplierRoom'
import VerifySupplierPO from './pages/VerifySupplierPO'
import VerifyGRN from './pages/VerifyGRN'
import VerifyInvoice from './pages/VerifyInvoice'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/cases/:styleNumber" element={<StyleRoom />} />
        <Route path="/cases/:styleNumber/verify" element={<VerifyCase />} />
        <Route path="/cases/:styleNumber/suppliers/:supplierId" element={<SupplierRoom />} />
        <Route path="/cases/:styleNumber/suppliers/:supplierId/pos/:poId/verify" element={<VerifySupplierPO />} />
        <Route path="/cases/:styleNumber/suppliers/:supplierId/pos/:poId/grns/:grnId/verify" element={<VerifyGRN />} />
        <Route path="/cases/:styleNumber/suppliers/:supplierId/invoices/:invoiceId/verify" element={<VerifyInvoice />} />
      </Routes>
    </BrowserRouter>
  )
}
