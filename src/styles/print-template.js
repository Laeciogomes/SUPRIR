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
@media print { button { display: none; } }
`;
