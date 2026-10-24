import type { PrintData } from "./print-data";
/** Fixture presentation strings only; never used for an issued document. */
export const SAMPLE_PRINT_DATA: PrintData = {
 quote:{number:"TRC-SAMPLE-0142",revision:"Rev 3",date:"2026-10-01",validUntil:"2026-11-14",currency:"INR",title:"Commercial quotation",taxLabel:"GST 18%",taxMode:"exclusive",notes:"Sample quotation — replace this with an issued revision to preview your document."},
 seller:{name:"Northstar Industrial",address:"27 Foundry Park, Pune, Maharashtra, IN",taxId:"DEMO-GSTIN-NORTHSTAR",contact:"sales@northstar.example.test"},
 customer:{name:"Aster Process Systems",contact:"Rahul Verma",email:"procurement@aster.example.test",address:"Gate 4, Vadodara, Gujarat, IN",taxId:"DEMO-GSTIN-ASTER"},
 totals:{subtotal:"INR 5,000.00",discount:"INR 0.00",tax:"INR 900.00",charges:"INR 0.00",grand:"INR 5,900.00"},
 items:[{id:"sample-line",sku:"NS-FR-4402",description:"Steel mounting frame, custom",spec:"",qty:"4",unit:"EA",rate:"INR 1,250.00",tax_code:"GST18",amount:"INR 5,000.00"}],charges:[],paymentSchedule:[],
 tokens:{"seller.name":"Northstar Industrial","seller.tax_id":"DEMO-GSTIN-NORTHSTAR","customer.name":"Aster Process Systems","customer.contact":"Rahul Verma","quote.number":"TRC-SAMPLE-0142","quote.rev":"Rev 3","quote.date":"2026-10-01","quote.valid_until":"2026-11-14","quote.title":"Commercial quotation","totals.grand":"INR 5,900.00","totals.subtotal":"INR 5,000.00","totals.tax":"INR 900.00"},
};
