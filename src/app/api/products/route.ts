import { parseQuery, route } from "@/lib/api";
import { listCategories, listProducts, productListQuery } from "@/services/product.service";

export const GET = route({ permission: "products.view" }, async ({ req, auth }) => {
  const [list, categories] = await Promise.all([listProducts(auth.store.id, parseQuery(req, productListQuery)), listCategories(auth.store.id)]);
  return { ...list, categories };
});
