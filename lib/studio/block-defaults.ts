import type { BlockType, PropMap } from "./layout-schema.ts";
export const BLOCK_DEFAULTS: { [K in BlockType]: PropMap[K] } = {
 letterhead:{align:"split",showAddress:true,showContact:true,variant:"plain"},logo:{height:34,align:"left"},
 cover:{title:"{{quote.title}}",subtitle:"Prepared for {{customer.name}}",abstract:"",meta:"columns",tone:"light"},
 quote_meta:{fields:["number","revision","date","valid_until","currency"],direction:"row",labels:true},parties:{layout:"two-col",tint:false},
 intro:{text:"Prepared for {{customer.name}}."},line_items:{columns:["description","qty","unit","rate","tax_code","amount"],zebra:false,boxed:false,specs:false},
 totals:{layout:"right",showExtras:true},extra_charges:{},payment_schedule:{layout:"table",showNotes:true},terms:{text:"",columns:1},
 acceptance:{text:"Use the secure buyer link to record your decision against this revision.",showExpiry:true},notes:{},spacer:{height:18,rule:false},free_text:{text:"New text block",align:"left"},footer:{text:"{{seller.name}}",right:"",rule:true,pageNumbers:"x_of_y"},
};
