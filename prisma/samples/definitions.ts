import type { SampleDefinition } from "../../src/domain/catalogue/samples";

/**
 * The 10 sample products (005 US1, docs/redesign-plan.md §6 item 8).
 *
 * An import source, like src/data/product.json for catalogue:import: read only
 * by `npm run seed:samples` and the placeholder generator, never by the
 * running storefront (Constitution III, R-411; a unit test asserts src/ does
 * not import it). Once seeded, the owner edits the samples in the admin.
 *
 * Descriptions state shape, material and use only — no performance or
 * comparative claims (FR-006). The short description is also the product
 * page's meta description, so it stays within 20–155 characters
 * (Constitution VIII). The English copy needs client sign-off.
 */
export const SAMPLE_DEFINITIONS: readonly SampleDefinition[] = [
  {
    slug: "sandal-slide-cloud-tebal",
    id: {
      name: "Sandal Slide Cloud Tebal",
      shortDescription: "Sandal slide dengan sol busa tebal dan satu tali lebar, untuk di rumah.",
      longDescription:
        "Model slide tanpa tali belakang, mudah dipakai dan dilepas. Sol busa tebal dengan permukaan atas yang sedikit cekung, dan satu tali lebar di bagian depan. Cocok dipakai di dalam rumah atau ke teras.",
    },
    en: {
      name: "Thick Cloud Slide Sandals",
      shortDescription: "Slide sandals with a thick foam sole and one wide strap, for home.",
      longDescription:
        "A slide with no back strap, easy to slip on and off. A thick foam sole with a slightly dished top, and one wide strap across the front. Made for wearing indoors or out to the porch.",
    },
    image: "/images/placeholders/sample-01.png",
    tint: "#F3EADD",
  },
  {
    slug: "sandal-jepit-karet-klasik",
    id: {
      name: "Sandal Jepit Karet Klasik",
      shortDescription: "Sandal jepit model klasik dari karet, dengan tali berbentuk Y.",
      longDescription:
        "Sandal jepit dengan sol karet rata dan tali berbentuk Y yang terselip di antara jari. Ringan dan mudah dibersihkan, untuk dipakai sehari-hari di rumah atau di sekitar rumah.",
    },
    en: {
      name: "Classic Rubber Flip-Flops",
      shortDescription: "Classic flip-flops made of rubber, with a Y-shaped strap.",
      longDescription:
        "Flip-flops with a flat rubber sole and a Y-shaped strap that sits between the toes. Light and easy to clean, for everyday wear at home or around the neighbourhood.",
    },
    image: "/images/placeholders/sample-02.png",
    tint: "#F3E7DC",
  },
  {
    slug: "sandal-rumah-bulu-lembut",
    id: {
      name: "Sandal Rumah Bulu Lembut",
      shortDescription: "Sandal rumah tertutup dengan lapisan bulu sintetis di bagian dalam.",
      longDescription:
        "Sandal rumah model tertutup di bagian depan, dengan lapisan bulu sintetis di dalam dan sol karet tipis. Dipakai di dalam rumah, di atas lantai keramik atau kayu.",
    },
    en: {
      name: "Soft Fluffy House Slippers",
      shortDescription: "Closed-toe house slippers lined with synthetic fur inside.",
      longDescription:
        "House slippers with a closed front, a synthetic fur lining and a thin rubber sole. For wearing indoors, on tile or wooden floors.",
    },
    image: "/images/placeholders/sample-03.png",
    tint: "#FBEBD3",
  },
  {
    slug: "sandal-selop-anyaman",
    id: {
      name: "Sandal Selop Anyaman",
      shortDescription: "Sandal selop dengan bagian atas anyaman dan sol rata.",
      longDescription:
        "Selop tanpa tali belakang dengan bagian atas dari bahan anyaman yang menutup punggung kaki. Sol rata, untuk dipakai di rumah maupun saat bepergian santai.",
    },
    en: {
      name: "Woven Mule Sandals",
      shortDescription: "Mule sandals with a woven upper and a flat sole.",
      longDescription:
        "A backless mule with a woven upper that covers the top of the foot. A flat sole, for wearing at home or on relaxed outings.",
    },
    image: "/images/placeholders/sample-04.png",
    tint: "#FAF6F0",
  },
  {
    slug: "sandal-slide-strap-ganda",
    id: {
      name: "Sandal Slide Strap Ganda",
      shortDescription: "Sandal slide dengan dua tali sejajar di bagian depan.",
      longDescription:
        "Model slide dengan dua tali sejajar yang menahan kaki di bagian depan dan sol berkontur. Tanpa tali belakang, mudah dipakai di rumah atau untuk keluar sebentar.",
    },
    en: {
      name: "Double Strap Slide Sandals",
      shortDescription: "Slide sandals with two parallel straps across the front.",
      longDescription:
        "A slide with two parallel straps holding the front of the foot and a contoured sole. No back strap, easy to wear at home or for a quick trip out.",
    },
    image: "/images/placeholders/sample-05.png",
    tint: "#EADBC8",
  },
  {
    slug: "sandal-platform-kasual",
    id: {
      name: "Sandal Platform Kasual",
      shortDescription: "Sandal kasual dengan sol platform yang lebih tinggi dari sol biasa.",
      longDescription:
        "Sandal dengan sol platform yang menaikkan tinggi badan sedikit, dan tali silang di bagian depan. Untuk dipakai santai di luar rumah.",
    },
    en: {
      name: "Casual Platform Sandals",
      shortDescription: "Casual sandals with a platform sole, higher than a regular sole.",
      longDescription:
        "Sandals with a platform sole that adds a little height, and crossed straps at the front. For casual wear outside the home.",
    },
    image: "/images/placeholders/sample-06.png",
    tint: "#E8D5C0",
  },
  {
    slug: "sandal-gunung-tali-velcro",
    id: {
      name: "Sandal Gunung Tali Velcro",
      shortDescription: "Sandal gunung dengan tali perekat yang bisa diatur dan sol bergerigi.",
      longDescription:
        "Sandal gunung dengan tali di punggung kaki dan di belakang tumit, keduanya memakai perekat sehingga bisa diatur. Sol bergerigi untuk jalan di luar rumah.",
    },
    en: {
      name: "Velcro Strap Outdoor Sandals",
      shortDescription: "Outdoor sandals with adjustable hook-and-loop straps and a lugged sole.",
      longDescription:
        "Outdoor sandals with straps over the foot and behind the heel, both fastened with hook-and-loop so they can be adjusted. A lugged sole for walking outside.",
    },
    image: "/images/placeholders/sample-07.png",
    tint: "#F0E2CD",
  },
  {
    slug: "sandal-rumah-waffle",
    id: {
      name: "Sandal Rumah Waffle",
      shortDescription: "Sandal rumah dengan bagian atas kain bertekstur waffle.",
      longDescription:
        "Sandal rumah model slide dengan bagian atas dari kain bertekstur kotak-kotak seperti waffle dan sol empuk yang tipis. Untuk dipakai di dalam rumah.",
    },
    en: {
      name: "Waffle House Slippers",
      shortDescription: "House slippers with a waffle-textured fabric upper.",
      longDescription:
        "Slide-style house slippers with a fabric upper in a waffle-grid texture and a thin cushioned sole. For wearing indoors.",
    },
    image: "/images/placeholders/sample-08.png",
    tint: "#EDE3D6",
  },
  {
    slug: "sandal-slide-anak-pastel",
    id: {
      name: "Sandal Slide Anak Pastel",
      shortDescription: "Sandal slide ukuran anak dalam pilihan warna pastel.",
      longDescription:
        "Sandal slide untuk anak dengan satu tali lebar dan sol ringan, dalam warna-warna pastel. Mudah dipakai sendiri oleh anak, untuk di rumah atau bermain di luar.",
    },
    en: {
      name: "Kids' Pastel Slide Sandals",
      shortDescription: "Children's slide sandals in a choice of pastel colours.",
      longDescription:
        "Slide sandals for children with one wide strap and a light sole, in pastel colours. Easy for a child to put on alone, for home or playing outside.",
    },
    image: "/images/placeholders/sample-09.png",
    tint: "#F6E9D7",
  },
  {
    slug: "sandal-jepit-sol-tebal",
    id: {
      name: "Sandal Jepit Sol Tebal",
      shortDescription: "Sandal jepit dengan sol yang lebih tebal dari model jepit biasa.",
      longDescription:
        "Sandal jepit dengan tali berbentuk Y dan sol tebal berlapis. Untuk dipakai sehari-hari di rumah atau saat keluar sebentar.",
    },
    en: {
      name: "Thick Sole Flip-Flops",
      shortDescription: "Flip-flops with a sole thicker than a regular flip-flop.",
      longDescription:
        "Flip-flops with a Y-shaped strap and a thick layered sole. For everyday wear at home or for a quick trip out.",
    },
    image: "/images/placeholders/sample-10.png",
    tint: "#E4D3BF",
  },
];
