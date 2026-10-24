import { notFound } from "next/navigation";
import { requireApplicationContext } from "@/lib/auth/context";
import { StudioWorkspace } from "@/components/studio/studio-workspace";
import { getBrand, listAssets, listActivity, listTemplates, readAsset } from "@/lib/studio/server";
import { recentIssuedPreviews } from "@/lib/studio/issued-document";
export default async function StudioPage() {
 const context=await requireApplicationContext(); if(!context.capabilities.includes("template.read"))notFound();
 const [templates,brand,activity,previews,assets]=await Promise.all([listTemplates(),getBrand(),listActivity(),recentIssuedPreviews(),listAssets()]);
 let logo:{mime:string;base64:string}|null=null;
 if(brand.logo_asset_id){try{const asset=await readAsset(brand.logo_asset_id);logo={mime:asset.mime,base64:Buffer.from(asset.bytes).toString("base64")};}catch{console.warn("studio_brand_logo_unavailable");}}
 return <StudioWorkspace assets={assets} templates={templates} brand={brand} activity={activity} previews={previews} logo={logo} canManage={context.capabilities.includes("template.manage")} canBrand={context.capabilities.includes("brand.manage")} canPrint={context.capabilities.includes("quote.read")&&context.capabilities.includes("template.read")} canExport={context.capabilities.includes("workspace.export")&&context.capabilities.includes("organization.manage")} />;
}
