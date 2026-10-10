import { redirect } from "next/navigation";

/** /ads/campaigns → the Campaigns tab of the Meta Ads page. */
export default function CampaignsIndex() {
  redirect("/ads?tab=campaigns");
}
