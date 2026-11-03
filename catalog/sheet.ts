import Sheet from "./Sheet.astro";

interface Options {
  pages?: number;
  sheet?: "document" | "handout" | "onepager";
}

export const onSheet = (args: object, props: Options = {}) => ({
  args,
  decorators: [{ component: Sheet, props }],
});
