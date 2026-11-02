// A story on its sheet (Sheet.astro): the component's props as Astrobook's args, the sheet as its
// decorator.
import Sheet from "./Sheet.astro";

interface Options {
  pages?: number;
  sheet?: "document" | "handout" | "onepager";
}

export const onSheet = (args: object, props: Options = {}) => ({
  args,
  decorators: [{ component: Sheet, props }],
});
