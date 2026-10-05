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

// The content the plugins react to: code blocks (fenced, also inside lists and
// quotes, or indented), `mermaid` fences, `$$` math (single-dollar math is off
// in @streamdown/math) and Chinese, Japanese or Korean script. A false positive
// only loads a plugin the reply did not need.
const pluginPatterns: Array<[PluginName, RegExp]> = [
  ["code", /(^|\n)[ \t>]*(`{3,}|~{3,})|(^|\n)( {4,}|\t)\S/],
  ["math", /\$\$/],
  ["mermaid", /(^|\n)[ \t>]*(`{3,}|~{3,})[ \t]*mermaid\b/i],
  ["cjk", /[\u1100-\u11ff\u2e80-\u2fdf\u3000-\u303f\u3040-\u30ff\u3100-\u31ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]|[\ud840-\ud87f][\udc00-\udfff]/],
];

/** The plugins a reply needs, as a stable key such as "code,mermaid". */
export function pluginKey(markdown: unknown) {
  const text = typeof markdown === "string" ? markdown : "";
  return pluginPatterns
    .filter(([, pattern]) => pattern.test(text))
    .map(([name]) => name)
    .join(",");
}

type RendererComponent = ComponentType<MessageResponseProps>;

function PlainText({ className, children }: MessageResponseProps) {
  return <div className={cn(className, "whitespace-pre-wrap")}>{children}</div>;
}

// Renderers whose modules finished loading render without suspending, so a
// reply mounted later (a new answer, another chat) never flashes plain text.
const loaded = new Map<string, RendererComponent>();
const loading = new Map<string, Promise<RendererComponent>>();

function loadRenderer(key: string): Promise<RendererComponent> {
  const pending = loading.get(key);
  if (pending) return pending;
  const names = key ? (key.split(",") as PluginName[]) : [];
  const promise = Promise.all([
    import("streamdown"),
    ...names.map((name) => pluginLoaders[name]()),
  ]).then(([{ Streamdown: Markdown }, ...plugins]) => {
    const config = Object.fromEntries(names.map((name, index) => [name, plugins[index]]));
    function StreamdownWithPlugins(props: MessageResponseProps) {
      return <Markdown plugins={config} {...props} />;
    }
    loaded.set(key, StreamdownWithPlugins);
    return StreamdownWithPlugins;
  });
  loading.set(key, promise);
  // A chunk can fail to load, for example after an update replaced the files
  // an open tab refers to. The next reply then tries again.
  promise.catch(() => loading.delete(key));
  return promise;
}

// One lazy component per plugin combination, so the server render and the
// hydrating client wait for the same modules and produce the same markup.
const lazyRenderers = new Map<string, LazyExoticComponent<RendererComponent>>();

function lazyRenderer(key: string) {
  const cached = lazyRenderers.get(key);
  if (cached) return cached;
  const renderer = lazy<RendererComponent>(() => loadRenderer(key).then(
    (component): { default: RendererComponent } => ({ default: component }),
    () => {
      lazyRenderers.delete(key);
      return { default: PlainText };
    }
  ));
  lazyRenderers.set(key, renderer);
  return renderer;
}

/** Starts loading the renderer before it is needed, for example when the user starts typing. */
export function preloadMessageResponse() {
  loadRenderer("").catch(() => undefined);
}

export const MessageResponse = memo(
  ({ className, ...props }: MessageResponseProps) => {
    // While a streaming reply gains a plugin (say, its first code fence), the
    // deferred key keeps the current renderer on screen until the new one loaded.
    const key = useDeferredValue(pluginKey(props.children));
    // A lazy wrapper renders synchronously once resolved; preferring it keeps
    // the component type stable, so a mounted reply never remounts Streamdown.
    const Renderer = lazyRenderers.get(key) ?? loaded.get(key) ?? lazyRenderer(key);
    const classes = cn("size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0", className);
    return (
      <Suspense fallback={<PlainText className={classes} {...props} />}>
        <Renderer className={classes} {...props} />
      </Suspense>
    );
  },
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    nextProps.isAnimating === prevProps.isAnimating
);

MessageResponse.displayName = "MessageResponse";
