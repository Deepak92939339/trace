import { notFound } from "next/navigation";
import { StudioWorkspace } from "@/components/studio/studio-workspace";
import { DEFAULT_BRAND } from "@/lib/studio/layout-schema";
import { SYSTEM_TEMPLATES } from "@/lib/studio/templates";
export default function StudioFixturePage(){
 if(process.env.NODE_ENV==="production")notFound();
 return <StudioWorkspace fixture assets={[]} templates={[{id:"00000000-0000-4000-8000-000000000001",organization_id:"00000000-0000-4000-8000-000000000002",name:"Classic fixture",base_template_key:"classic",layout:SYSTEM_TEMPLATES[0].layout,version:1,is_default:true,archived_at:null}]} brand={DEFAULT_BRAND} activity={[]} previews={[]} logo={null} canManage canBrand={false} canPrint={false} canExport={false}/>;
}
