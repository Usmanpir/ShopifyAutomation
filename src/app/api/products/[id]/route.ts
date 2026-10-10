import { parseJson, route } from "@/lib/api";
import { getProductDetail, productUpdateSchema, updateProduct } from "@/services/product.service";

export const GET = route<{ id: string }>({ permission: "products.view" }, async ({ params, auth }) => getProductDetail(auth.store.id, params.id));

export const PATCH = route<{ id: string }>({ permission: "products.update" }, async ({ req, params, ctx }) => updateProduct(ctx, params.id, await parseJson(req, productUpdateSchema)));
