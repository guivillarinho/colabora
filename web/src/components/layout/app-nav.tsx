import { cn } from 'cn'
import type { ReactNode } from 'react'

import { navItems, useNavigation } from './navigation'
import type { NavItem } from './navigation'

type AppNavProps = {
  layout: 'sidebar' | 'bottom'
  center?: ReactNode
}

export function AppNav({ layout, center }: AppNavProps) {
  const { section, goTo } = useNavigation()
  const isBottom = layout === 'bottom'

  if (isBottom) {
    const leading = navItems.slice(0, 2)
    const trailing = navItems.slice(2)

    return (
      <nav
        aria-label="Navegação inferior"
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-background md:hidden"
      >
        <ul className="grid grid-cols-[1fr_auto_1fr] items-center px-3 py-2">
          <li>
            <ul className="grid grid-cols-2">
              {leading.map((item) => (
                <li key={item.id} className="flex justify-center">
                  {renderItem(item)}
                </li>
              ))}
            </ul>
          </li>
          <li className="flex justify-center px-2">{center}</li>
          <li>
            <ul className="grid grid-cols-2">
              {trailing.map((item) => (
                <li key={item.id} className="flex justify-center">
                  {renderItem(item)}
                </li>
              ))}
            </ul>
          </li>
        </ul>
      </nav>
    )
  }

  return (
    <nav
      aria-label="Navegação lateral"
      className="flex flex-1 flex-col px-3 py-2"
    >
      <ul className="grid gap-1">
        {navItems.map((item) => (
          <li key={item.id}>{renderItem(item)}</li>
        ))}
      </ul>
    </nav>
  )

  function renderItem(item: NavItem) {
    const Icon = item.icon
    const isActive = section === item.id

    return (
      <button
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'flex w-fit items-center rounded-lg font-medium',
          isBottom
            ? 'h-14 w-16 flex-col justify-center gap-0.5 px-1 text-[11px] leading-none'
            : 'gap-2.5 px-2.5 py-1.5 text-sm',
          isActive
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
        type="button"
        onClick={() => {
          goTo(item.id)
        }}
      >
        <Icon aria-hidden="true" className="size-5" />
        {item.label}
      </button>
    )
  }
}
