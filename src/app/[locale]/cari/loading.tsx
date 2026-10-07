import { Container } from "@/components/ui/Container";
import { ProductCardSkeleton } from "@/components/ui/ProductCard";
import { ProductGrid } from "@/components/ui/ProductGrid";
import { Skeleton } from "@/components/ui/Skeleton";

/** The search page without data: the heading, the count line and a grid of cards. */
export default function SearchLoading() {
  return (
    <main className="pb-10 lg:pb-16">
      <Container>
        <div className="flex flex-col gap-2 py-6 lg:py-10">
          <Skeleton className="h-8 w-2/3 lg:h-10" />
          <Skeleton className="h-5 w-40" />
        </div>
        <ProductGrid>
          <ProductCardSkeleton count={4} />
        </ProductGrid>
      </Container>
    </main>
  );
}
