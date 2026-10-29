import type { TaskSort } from '../sort-tasks'

type TaskFiltersProps = {
  sort: TaskSort
  category: string
  categories: string[]
  onSortChange: (sort: TaskSort) => void
  onCategoryChange: (category: string) => void
}

export function TaskFilters({
  sort,
  category,
  categories,
  onSortChange,
  onCategoryChange,
}: TaskFiltersProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <label className="grid gap-1 text-sm font-medium" htmlFor="task-sort">
        Ordenar
        <select
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 font-normal"
          id="task-sort"
          value={sort}
          onChange={(event) => {
            onSortChange(event.target.value as TaskSort)
          }}
        >
          <option value="dueDate">Data</option>
          <option value="priority">Prioridade</option>
          <option value="category">Categoria</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm font-medium" htmlFor="task-category">
        Categoria
        <select
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 font-normal"
          id="task-category"
          value={category}
          onChange={(event) => {
            onCategoryChange(event.target.value)
          }}
        >
          <option value="">Todas</option>
          {categories.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
