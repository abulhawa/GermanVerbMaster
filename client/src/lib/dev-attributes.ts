import * as React from "react"

const isDev = import.meta.env.DEV

type DevAttributes = {
  "data-comp": string
  "data-id": string
}

export interface DebuggableComponentProps {
  debugId?: string
}

const slugify = (value: string | null | undefined) => {
  if (!value) return ""

  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

const formatComponentToken = (componentName: string) => {
  const slug = slugify(componentName)
  return slug.length > 0 ? slug : "component"
}

const formatDebugId = (componentName: string, debugId?: string | null) => {
  const slug = slugify(debugId)
  if (slug.length > 0) {
    return slug
  }

  return formatComponentToken(componentName)
}

export function getDevAttributes(
  componentName: string,
  debugId?: string | null,
): Partial<DevAttributes> {
  if (!isDev) {
    return {}
  }

  return {
    "data-comp": formatComponentToken(componentName),
    "data-id": formatDebugId(componentName, debugId),
  }
}

export function debugForwardRef<
  Element,
  Props extends DebuggableComponentProps,
>(
  componentName: string,
  render: (
    props: Omit<Props, "debugId">,
    ref: React.Ref<Element>,
    devAttributes: Partial<DevAttributes>,
  ) => React.ReactElement | null,
) {
  return React.forwardRef<Element, Props>((props, ref) => {
    const { debugId, ...rest } = props
    const devAttributes = getDevAttributes(componentName, debugId)

    return render(rest as Omit<Props, "debugId">, ref, devAttributes)
  })
}
