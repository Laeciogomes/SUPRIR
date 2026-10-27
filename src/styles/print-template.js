export const PRINT_STYLES = String.raw`
@page { size: A4; margin: 12mm; }
* { box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; color: #1b1b1b; margin: 0; font-size: 10.5px; line-height: 1.45; }
.print-header { background: #ffffff; border: 1px solid #eadc91; border-top: 7px solid #f6c900; border-radius: 10px; padding: 13px 16px 12px; margin-bottom: 17px; break-inside: avoid; }
.print-header-brand { display: flex; align-items: center; justify-content: center; min-height: 72px; background: #fff; border-radius: 8px; }
.print-header-brand img { display: block; width: min(100%, 780px); max-height: 92px; object-fit: contain; }
.print-header-title { background: #fff8cf; border: 1px solid #efd868; border-left: 6px solid #f04423; border-radius: 8px; padding: 9px 12px; margin-top: 11px; }
.print-header-title span { display: block; color: #6d6650; font-size: 8px; text-transform: uppercase; letter-spacing: .1em; }
.print-header-title strong { display: block; color: #1d1b13; font-size: 11px; margin-top: 1px; }
.print-header-title h1 { color: #1b1b1b; font-size: 20px; margin: 3px 0 0; }
.print-header-title p { color: #5c584b; margin: 2px 0 0; }
.print-meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 14px 0; }
.print-meta div, .print-box { border: 1px solid #ded9c8; border-radius: 8px; padding: 9px; }
.print-meta span, .print-label { display: block; color: #706c60; font-size: 8px; text-transform: uppercase; letter-spacing: .05em; }
.print-meta strong { font-size: 10.5px; }
h2 { font-size: 14px; color: #242116; margin: 20px 0 8px; padding-left: 8px; border-left: 4px solid #f6c900; }
table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; }
th { background: #fff5bd; color: #3a3522; text-align: left; font-size: 8px; text-transform: uppercase; padding: 7px; border: 1px solid #dcd4b4; }
td { padding: 7px; border: 1px solid #e3dfd1; vertical-align: top; }
td.num { text-align: right; }
.badge { display: inline-block; border-radius: 999px; padding: 3px 7px; background: #fff0a6; color: #373015; font-weight: bold; }
.audit-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.delivery-block { border: 1px solid #ddd7c2; border-radius: 9px; padding: 10px; margin: 8px 0; break-inside: avoid; }
.delivery-head { display: flex; justify-content: space-between; border-bottom: 2px solid #f6c900; padding-bottom: 6px; margin-bottom: 6px; }
.footer { margin-top: 22px; border-top: 2px solid #f6c900; padding-top: 8px; text-align: center; color: #716d61; font-size: 8px; }
.signature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 45px; }
.signature { border-top: 1px solid #333; text-align: center; padding-top: 5px; }
.muted { color: #716d61; }
.no-break { break-inside: avoid; }
.order-report-block { border: 1px solid #ded7bd; border-radius: 9px; padding: 10px; margin: 10px 0 16px; break-inside: avoid; page-break-inside: avoid; }
.order-report-block h2 { margin-top: 0; }
.order-report-block .print-box p { margin: 4px 0 0; color: #5b5546; }
.order-report-block table { margin-top: 8px; }
tfoot th, tfoot td { background: #fff5bd; font-weight: bold; }
/* Termo de entrega: duas vias independentes, com area de assinatura manual. */
.receipt-copy { break-after: page; page-break-after: always; }
.receipt-copy.receipt-last { break-after: auto; page-break-after: auto; }
.receipt-copy .print-header { margin-bottom: 7px; padding: 7px 9px; border-radius: 4px; }
.receipt-copy .print-header-brand { min-height: 28px; }
.receipt-copy .print-header-brand img { max-height: 54px; }
.receipt-copy .print-header-title { margin-top: 5px; padding: 5px 9px; }
.receipt-copy .print-header-title h1 { font-size: 14px; }
.receipt-copy .print-header-title p { font-size: 9px; }
.receipt-copy-label { font-size: 10px; font-weight: bold; letter-spacing: .08em; text-align: right; padding: 5px 0; border-bottom: 1px solid #a8a8a8; }
.receipt-summary { display: grid; grid-template-columns: 1fr 1fr; column-gap: 10px; row-gap: 5px; padding: 10px 0; }
.receipt-summary div { display: flex; gap: 9px; }
.receipt-summary span, .receipt-destination span { color: #555; font-size: 9px; }
.receipt-summary strong { font-size: 10px; }
.receipt-destination { border: 1px solid #d9d2bb; padding: 9px; display: flex; flex-direction: column; }
.receipt-destination strong { font-size: 12px; }
.receipt-destination small { font-size: 9px; }
.receipt-declaration { margin: 12px 0 8px; text-align: justify; font-size: 10px; }
.receipt-table { margin-top: 8px; }
.receipt-table td { font-size: 10px; padding: 6px; }
.receipt-table tr { break-inside: avoid; page-break-inside: avoid; }
.receipt-num { text-align: center; }
.receipt-substitution { font-size: 9px; font-style: italic; color: #555; margin-top: 2px; }
.receipt-audit { margin: 7px 0; font-size: 9px; }
.receipt-audit span { padding: 0 8px; }
.receipt-confirm { font-weight: bold; }
.receipt-remarks { margin-top: 13px; min-height: 54px; font-size: 10px; }
.receipt-line { border-bottom: 1px solid #bbb; margin: 11px 0; }
.receipt-date { margin-top: 11px; font-size: 10px; }
.receipt-signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-top: 43px; text-align: center; }
.receipt-signatures .receipt-sign-line { border-top: 1px solid #333; }
.receipt-signatures strong { display: block; margin-top: 6px; font-size: 10px; }
.receipt-signatures span { display: block; font-size: 9px; }
.receipt-footnote { margin-top: 14px; font-size: 8px; color: #555; }
@media print { button { display: none; } .receipt-copy { page-break-after: always; } .receipt-copy.receipt-last { page-break-after: auto; } }

`;
