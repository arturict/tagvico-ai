"use client";

import { cn } from "@/lib/utils";
import type { ComponentProps, ComponentType, LazyExoticComponent } from "react";
import { lazy, memo, Suspense, useDeferredValue } from "react";
import type { Streamdown } from "streamdown";

export type MessageResponseProps = ComponentProps<typeof Streamdown>;

// Streamdown and its plugins are most of the chat page's JavaScript (Mermaid,
// KaTeX and Shiki alone are several hundred kilobytes). The empty start chat
// renders no reply at all, and most replies are plain prose, so the renderer
// loads with the first reply and each plugin only with a reply that uses it.
const pluginLoaders = {
  code: () => import("@streamdown/code").then((module) => module.code),
  math: () => import("@streamdown/math").then((module) => module.math),
  mermaid: () => import("@streamdown/mermaid").then((module) => module.mermaid),
  cjk: () => import("@streamdown/cjk").then((module) => module.cjk),
};

type PluginName = keyof typeof pluginLoaders;

// The same content tests the plugins themselves react to: fenced code blocks,
// `mermaid` fences, `$$` math (single-dollar math is off in @streamdown/math)
// and Chinese, Japanese or Korean script.
const pluginPatterns: Array<[PluginName, RegExp]> = [
  ["code", /(^|\n) {0,3}(`{3,}|~{3,})/],
  ["math", /\$\$/],
  ["mermaid", /(^|\n) {0,3}(`{3,}|~{3,})\s*mermaid\b/i],
  ["cjk", /[\u3000-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uff00-\uffef]/],
];

/** The plugins a reply needs, as a stable key such as "code,mermaid". */
export function pluginKey(markdown: unknown) {
  const text = typeof markdown === "string" ? markdown : "";
  return pluginPatterns
    .filter(([, pattern]) => pattern.test(text))
    .map(([name]) => name)
    .join(",");
}

type Renderer = LazyExoticComponent<ComponentType<MessageResponseProps>>;
const renderers = new Map<string, Renderer>();

// One lazy component per plugin combination, so the server render and the
// hydrating client wait for the same modules and produce the same markup.
function rendererFor(key: string): Renderer {
  const cached = renderers.get(key);
  if (cached) return cached;
  const names = key ? (key.split(",") as PluginName[]) : [];
  const renderer = lazy(async () => {
    const [{ Streamdown: Markdown }, ...plugins] = await Promise.all([
      import("streamdown"),
      ...names.map((name) => pluginLoaders[name]()),
    ]);
    const config = Object.fromEntries(names.map((name, index) => [name, plugins[index]]));
    function StreamdownWithPlugins(props: MessageResponseProps) {
      return <Markdown plugins={config} {...props} />;
    }
    return { default: StreamdownWithPlugins };
  });
  renderers.set(key, renderer);
  return renderer;
}

/** Starts loading the renderer before the first reply arrives, for example when the user starts typing. */
export function preloadMessageResponse() {
  void import("streamdown");
}

export const MessageResponse = memo(
  ({ className, ...props }: MessageResponseProps) => {
    // While a streaming reply gains a plugin (say, its first code fence), the
    // deferred key keeps the current renderer on screen until the new one loaded.
    const key = useDeferredValue(pluginKey(props.children));
    const Renderer = rendererFor(key);
    const classes = cn("size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0", className);
    return (
      <Suspense fallback={<div className={cn(classes, "whitespace-pre-wrap")}>{props.children}</div>}>
        <Renderer className={classes} {...props} />
      </Suspense>
    );
  },
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    nextProps.isAnimating === prevProps.isAnimating
);

MessageResponse.displayName = "MessageResponse";
