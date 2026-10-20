import { Container } from "@/components/ui/Container";
import { ProductCardSkeleton } from "@/components/ui/ProductCard";
import { ProductGrid } from "@/components/ui/ProductGrid";
import { Skeleton } from "@/components/ui/Skeleton";

/** The all-products page without data: heading, count, sort row and a grid of cards. */
export default function AllProductsLoading() {
  return (
    <main className="pb-10 lg:pb-16">
      <Container>
        <div className="flex flex-col gap-2 py-6 lg:py-10">
          <Skeleton className="h-8 w-1/2 lg:h-10" />
          <Skeleton className="h-5 w-24" />
        </div>
        <Skeleton className="mb-6 h-11 w-full max-w-md" />
        <ProductGrid>
          <ProductCardSkeleton count={8} />
        </ProductGrid>
      </Container>
    </main>
  );
}
