import { base44 } from '@/api/base44Client';
import { buildColorSwatches } from '@/lib/colorSwatches';

const CONCURRENCY = 2;

async function loadCatalog() {
  const [products, variants, images] = await Promise.all([
    base44.entities.Product.filter({ status: 'Active' }, '-created_date', 1000),
    base44.entities.ProductVariant.list('-created_date', 10000),
    base44.entities.ProductImage.list('-created_date', 20000),
  ]);
  return { products, variants, images };
}

function contextFromCatalog({ products, variants }) {
  const variantsByProduct = {};
  for (const v of variants) (variantsByProduct[v.product_id] ||= []).push(v);
  const swatchesByProduct = {};
  const targets = [];
  for (const p of products) {
    const swatches = buildColorSwatches(p, variantsByProduct[p.id] || []);
    if (swatches.length < 2) continue;
    // Gemini handles both solid colors and print/pattern-only labels.
    if (!swatches.some((s) => !s.image)) continue;
    targets.push(p);
    swatchesByProduct[p.id] = swatches;
  }
  return { targets, swatchesByProduct };
}

function requestError(error) {
  return error?.data?.data?.error || error?.data?.error || error?.message || 'AI analysis failed.';
}

export async function analyzePhotoColors(onProgress) {
  const catalog = await loadCatalog();
  const { targets, swatchesByProduct } = contextFromCatalog(catalog);
  const assignments = [];
  const productErrors = [];
  let imagesAnalyzed = 0, imagesFailed = 0, productsAnalyzed = 0, completed = 0, cursor = 0;
  let model = '';
  onProgress?.({ completed: 0, total: targets.length });

  async function worker() {
    while (cursor < targets.length) {
      const product = targets[cursor++];
      try {
        const { data } = await base44.functions.invoke('photoColorAssign', { productId: product.id });
        if (data?.error) {
          productErrors.push({ productName: product.name, error: data.error });
        } else {
          productsAnalyzed++;
          imagesAnalyzed += data?.imagesAnalyzed || 0;
          imagesFailed += data?.imagesFailed || 0;
          assignments.push(...(Array.isArray(data?.assignments) ? data.assignments : []));
          model = data?.model || model;
        }
      } catch (error) {
        productErrors.push({ productName: product.name, error: requestError(error) });
      }
      completed++;
      onProgress?.({ completed, total: targets.length });
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const missingColors = Object.values(swatchesByProduct)
    .flat().filter((s) => !s.image).length;
  return {
    productsAnalyzed,
    productsFailed: productErrors.length,
    productErrors,
    imagesAnalyzed,
    imagesFailed,
    unmatchedColors: Math.max(0, missingColors - assignments.length),
    assignments,
    model,
  };
}

export async function applyPhotoColors(assignments) {
  try {
    const { data } = await base44.functions.invoke('photoColorAssign', { apply: true, assignments });
    return data;
  } catch (error) {
    throw new Error(requestError(error));
  }
}
