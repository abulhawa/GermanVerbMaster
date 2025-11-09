import * as React from "react"

import { useIsMobile } from "@/hooks/use-mobile"

import {
  SIDEBAR_COOKIE_MAX_AGE,
  SIDEBAR_COOKIE_NAME,
  type SidebarState,
} from "../config"

type UseSidebarStateProps = {
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export type SidebarContextValue = {
  state: SidebarState
  open: boolean
  setOpen: (value: boolean | ((value: boolean) => boolean)) => void
  openMobile: boolean
  setOpenMobile: React.Dispatch<React.SetStateAction<boolean>>
  isMobile: boolean
  toggleSidebar: () => void
}

export function useSidebarState({
  defaultOpen = true,
  open: openProp,
  onOpenChange,
}: UseSidebarStateProps = {}): SidebarContextValue {
  const isMobile = useIsMobile()
  const [openMobile, setOpenMobile] = React.useState(false)
  const [_open, _setOpen] = React.useState(defaultOpen)

  const open = openProp ?? _open

  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      if (onOpenChange) {
        return onOpenChange(
          typeof value === "function" ? value(open) : value
        )
      }

      const resolvedValue =
        typeof value === "function" ? value(open) : value

      _setOpen(resolvedValue)

      document.cookie = `${SIDEBAR_COOKIE_NAME}=${resolvedValue}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`
    },
    [onOpenChange, open]
  )

  const toggleSidebar = React.useCallback(() => {
    return isMobile
      ? setOpenMobile((current) => !current)
      : setOpen((current) => !current)
  }, [isMobile, setOpen])

  return React.useMemo(
    () => ({
      state: open ? "expanded" : "collapsed",
      open,
      setOpen,
      openMobile,
      setOpenMobile,
      isMobile,
      toggleSidebar,
    }),
    [open, setOpen, openMobile, isMobile, toggleSidebar]
  )
}
