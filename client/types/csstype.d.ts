/**
 * CSS custom properties in `style` props, without a cast.
 *
 * `React.CSSProperties` is csstype's `Properties` interface, which lists only
 * the known CSS properties. Writing `style={{ "--stagger-index": 2 }}` is
 * therefore a type error, and the usual workaround —
 * `{ ... } as React.CSSProperties` — throws away checking for every other
 * property in the object at the same time.
 *
 * csstype is designed to be extended here instead: augmenting `Properties`
 * with a template-literal index signature makes any `--custom-property` valid
 * while leaving the rest of the interface, and its checking, intact.
 *
 * @see https://github.com/frenic/csstype#what-should-i-do-when-i-get-type-errors
 */
import "csstype";

declare module "csstype" {
    interface Properties {
        /** Any CSS custom property, holding the values CSS accepts for one. */
        [customProperty: `--${string}`]: string | number | undefined;
    }
}
