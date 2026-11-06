import { appPalettes } from '@/app/palette'
import { usePalette } from '@/app/palette-provider'

export function PalettePicker() {
  const { palette, setPalette } = usePalette()

  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium">Paleta</legend>
      <div className="flex flex-wrap gap-2" role="presentation">
        {appPalettes.map((item) => (
          <label
            key={item.id}
            className="grid cursor-pointer justify-items-center gap-1 rounded-xl px-1 py-1 text-xs has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring"
          >
            <input
              checked={palette === item.id}
              className="peer sr-only"
              name="app-palette"
              type="radio"
              value={item.id}
              onChange={() => setPalette(item.id)}
            />
            <span
              aria-hidden="true"
              className="palette-swatch size-8 rounded-full border border-border peer-checked:ring-2 peer-checked:ring-ring"
              data-palette={item.id}
            />
            <span>{item.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
