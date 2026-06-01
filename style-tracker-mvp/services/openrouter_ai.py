import base64
import io
import json
from typing import Any

import httpx

from config import settings

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions"

PRIMARY_MODEL = "anthropic/claude-3.5-sonnet"
DEEPSEEK_MODEL = "deepseek-chat"

DOCUMENT_PARSE_PROMPT = """You are a document parser for a garment manufacturing ERP system.
Extract all structured data from the provided document image/PDF into a JSON object.
Return ONLY valid JSON — no markdown, no explanation, no code fences.

Required top-level keys (include whatever is present; use null for absent fields):
{
  "style_number": null,
  "buyer_name": null,
  "supplier_name": null,
  "po_number": null,
  "invoice_number": null,
  "total_quantity": null,
  "total_value": null,
  "agreed_rate": null,
  "invoice_rate": null,
  "invoice_quantity": null,
  "taxable_value": null,
  "received_date": null,
  "grn_number": null,
  "material_category": null,
  "line_items": [],
  "payment_terms": null,
  "extra_fields": {}
}

Put any field not listed above into "extra_fields".
"""

SUPPLIER_PO_PARSE_PROMPT = """You are a document parser for a garment manufacturing procurement system.
Extract all structured data from this Supplier Purchase Order into a JSON object.
Return ONLY valid JSON — no markdown, no explanation, no code fences.

Required top-level keys (use null for absent fields):
{
  "supplier_name": null,
  "po_number": null,
  "material_category": null,
  "total_quantity": null,
  "total_value": null,
  "agreed_rate": null,
  "currency": null,
  "delivery_date": null,
  "payment_terms": null,
  "hsn_codes": [],
  "line_items": [
    {
      "item_name": null,
      "hsn_code": null,
      "quantity": null,
      "rate": null,
      "taxable_value": null,
      "uom": null,
      "description": null
    }
  ],
  "extra_fields": {}
}

For material_category, use exactly one of: FABRIC, BUTTONS, THREAD, PACKING, LABELS — or null if unclear.
Populate hsn_codes as a flat array of all unique HSN/SAC codes found in the document.
Put any field not in the schema above into "extra_fields".
"""


def _extract_pdf_text(file_bytes: bytes) -> str:
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(file_bytes))
        return "\n".join(page.extract_text() or "" for page in reader.pages).strip()
    except Exception:
        return ""


async def _call_openrouter(file_bytes: bytes, mime_type: str, prompt: str = DOCUMENT_PARSE_PROMPT) -> dict[str, Any]:
    b64 = base64.b64encode(file_bytes).decode()
    payload = {
        "model": PRIMARY_MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{b64}"}},
                ],
            }
        ],
        "response_format": {"type": "json_object"},
        "max_tokens": 4096,
    }
    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(OPENROUTER_URL, json=payload, headers=headers)
        resp.raise_for_status()
    raw = resp.json()["choices"][0]["message"]["content"]
    return json.loads(raw)


async def _call_deepseek(file_bytes: bytes, mime_type: str, prompt: str = DOCUMENT_PARSE_PROMPT) -> dict[str, Any]:
    if mime_type == "application/pdf":
        doc_text = _extract_pdf_text(file_bytes)
        user_content = f"{prompt}\n\nDocument text:\n{doc_text or '[no extractable text]'}"
    else:
        user_content = f"{prompt}\n\n[Image data omitted — return best-guess empty structure]"

    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": [{"role": "user", "content": user_content}],
        "response_format": {"type": "json_object"},
        "max_tokens": 4096,
    }
    headers = {
        "Authorization": f"Bearer {settings.deepseek_api_key}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(DEEPSEEK_URL, json=payload, headers=headers)
        resp.raise_for_status()
    raw = resp.json()["choices"][0]["message"]["content"]
    return json.loads(raw)


async def parse_document(file_bytes: bytes, mime_type: str = "application/pdf") -> dict[str, Any]:
    """Parse a general document — OpenRouter (Claude 3.5 Sonnet) primary, DeepSeek fallback."""
    try:
        return await _call_openrouter(file_bytes, mime_type)
    except Exception:
        return await _call_deepseek(file_bytes, mime_type)


async def parse_supplier_po(file_bytes: bytes, mime_type: str = "application/pdf") -> dict[str, Any]:
    """Parse a Supplier PO — targeted prompt, same OpenRouter → DeepSeek fallback chain."""
    try:
        return await _call_openrouter(file_bytes, mime_type, prompt=SUPPLIER_PO_PARSE_PROMPT)
    except Exception:
        return await _call_deepseek(file_bytes, mime_type, prompt=SUPPLIER_PO_PARSE_PROMPT)


GRN_PARSE_PROMPT = """You are a document parser for a garment manufacturing warehouse system.
Extract all structured data from this Goods Received Note (GRN), delivery challan, or material receipt document.
Return ONLY valid JSON — no markdown, no explanation, no code fences.

Required top-level keys (use null for absent fields):
{
  "challan_no": null,
  "challan_date": null,
  "vehicle_no": null,
  "supplier_name": null,
  "grn_number": null,
  "received_date": null,
  "line_items": [
    {
      "item_name": null,
      "incoming_qty": null,
      "uom": null
    }
  ],
  "extra_fields": {}
}

Rules:
- "line_items" MUST be a JSON array. If there is only one item, still return it as a single-element array.
- "incoming_qty" must be a number (not a string). Extract the received/delivered quantity per row.
- "uom" (unit of measurement) should be one of: CONE, BOX, GRS, PCS, MTR, KG, SET, ROLL — or whatever unit is printed.
- "challan_no" is the delivery challan number or document reference number.
- "grn_number" is the internal GRN reference if printed; otherwise null.
- "received_date" and "challan_date" must be ISO date strings (YYYY-MM-DD) if extractable, otherwise null.
- Put any field not listed above into "extra_fields".
"""


async def parse_grn(file_bytes: bytes, mime_type: str = "application/pdf") -> dict[str, Any]:
    """Parse a GRN/delivery challan — targeted prompt, OpenRouter → DeepSeek (pypdf text) fallback."""
    try:
        return await _call_openrouter(file_bytes, mime_type, prompt=GRN_PARSE_PROMPT)
    except Exception:
        return await _call_deepseek(file_bytes, mime_type, prompt=GRN_PARSE_PROMPT)
