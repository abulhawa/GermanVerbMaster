import * as React from "react"

import { useIsMobile } from "@/hooks/use-mobile"

import {
  SIDEBAR_COOKIE_MAX_AGE,
  SIDEBAR_COOKIE_NAME,
} from "../config"

type UseSidebarStateProps = {
  defaultOpen: boolean
  openProp?: boolean
  setOpenProp?: (open: boolean) => void
}

export function useSidebarState({
  defaultOpen,
  openProp,
  setOpenProp,
}: UseSidebarStateProps) {
  const isMobile = useIsMobile()
  const [openMobile, setOpenMobile] = React.useState(false)
  const [_open, _setOpen] = React.useState(defaultOpen)

  const open = openProp ?? _open

  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const resolvedValue =
        typeof value === "function" ? value(open) : value

      if (setOpenProp) {
        setOpenProp(resolvedValue)
        return
      }

      _setOpen(resolvedValue)

      document.cookie = `${SIDEBAR_COOKIE_NAME}=${resolvedValue}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`
    },
    [open, setOpenProp]
  )

  const toggleSidebar = React.useCallback(() => {
    return isMobile
      ? setOpenMobile((current) => !current)
      : setOpen((current) => !current)
  }, [isMobile, setOpen])

  const state: "expanded" | "collapsed" = open ? "expanded" : "collapsed"

  return {
    isMobile,
    open,
    openMobile,
    setOpen,
    setOpenMobile,
    state,
    toggleSidebar,
  }
}
