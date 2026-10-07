import { Container } from "@/components/ui/Container";
import { ProductCardSkeleton } from "@/components/ui/ProductCard";
import { ProductGrid } from "@/components/ui/ProductGrid";
import { Skeleton } from "@/components/ui/Skeleton";

/** The category page's layout without data, so nothing shifts on arrival (FR-028a). */
export default function CategoryLoading() {
  return (
    <main>
      <Container>
        <div className="py-6 lg:py-10">
          <Skeleton className="h-8 w-48 lg:h-10" />
        </div>
        <ProductGrid>
          <ProductCardSkeleton count={4} />
        </ProductGrid>
      </Container>
    </main>
  );
}
