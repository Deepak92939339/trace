import { notFound } from "next/navigation";
import { requireApplicationContext } from "@/lib/auth/context";
import { StudioWorkspace } from "@/components/studio/studio-workspace";
import { getBrand, listActivity, listTemplates, readAsset } from "@/lib/studio/server";
import { recentIssuedPreviews } from "@/lib/studio/issued-document";
export default async function StudioPage() {
 const context=await requireApplicationContext(); if(!context.capabilities.includes("template.read"))notFound();
 const [templates,brand,activity,previews]=await Promise.all([listTemplates(),getBrand(),listActivity(),recentIssuedPreviews()]);
 let logo:{mime:string;bytes:number[]}|null=null;
 if(brand.logo_asset_id){try{const asset=await readAsset(brand.logo_asset_id);logo={mime:asset.mime,bytes:Array.from(asset.bytes)};}catch{console.warn("studio_brand_logo_unavailable");}}
 return <StudioWorkspace templates={templates} brand={brand} activity={activity} previews={previews} logo={logo} canManage={context.capabilities.includes("template.manage")} canBrand={context.capabilities.includes("brand.manage")} canPrint={context.capabilities.includes("quote.read")&&context.capabilities.includes("template.read")} canExport={context.capabilities.includes("workspace.export")&&context.capabilities.includes("organization.manage")} />;
}
