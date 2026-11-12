import { Injectable } from '@nestjs/common'

export type GoogleTaskBody = {
  title: string
  notes?: string
  due?: string
  status?: 'needsAction' | 'completed'
}

@Injectable()
export class GoogleTasksClient {
  private headers(token: string) {
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }
  }

  listLists(token: string) {
    return this.request(
      token,
      'https://tasks.googleapis.com/tasks/v1/users/@me/lists',
    )
  }

  createList(token: string, title: string) {
    return this.request(
      token,
      'https://tasks.googleapis.com/tasks/v1/users/@me/lists',
      {
        method: 'POST',
        body: JSON.stringify({ title }),
      },
    )
  }

  patchList(token: string, listId: string, title: string) {
    return this.request(
      token,
      `https://tasks.googleapis.com/tasks/v1/users/@me/lists/${encodeURIComponent(listId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ title }),
      },
    )
  }

  deleteList(token: string, listId: string) {
    return this.request(
      token,
      `https://tasks.googleapis.com/tasks/v1/users/@me/lists/${encodeURIComponent(listId)}`,
      { method: 'DELETE' },
    )
  }

  move(
    token: string,
    fromListId: string,
    taskId: string,
    destinationListId: string,
  ) {
    const url = new URL(
      `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(fromListId)}/tasks/${encodeURIComponent(taskId)}/move`,
    )
    url.searchParams.set('destinationTasklist', destinationListId)
    return this.request(token, url.toString(), { method: 'POST' })
  }

  listUpdated(token: string, listId: string, updatedMin?: string | null) {
    const url = new URL(
      `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks`,
    )
    url.searchParams.set('showCompleted', 'true')
    url.searchParams.set('showDeleted', 'true')
    url.searchParams.set('showHidden', 'true')
    url.searchParams.set('maxResults', '100')
    if (updatedMin) url.searchParams.set('updatedMin', updatedMin)
    return this.request(token, url.toString())
  }

  async upsert(
    token: string,
    listId: string,
    existingId: string | null,
    body: GoogleTaskBody,
  ) {
    const base = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks`
    if (existingId) {
      const updated = await this.request(
        token,
        `${base}/${encodeURIComponent(existingId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify(body),
        },
      )
      if (updated.status !== 404) return updated
    }
    return this.request(token, base, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }

  remove(token: string, listId: string, taskId: string) {
    return this.request(
      token,
      `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`,
      { method: 'DELETE' },
    )
  }

  private request(token: string, url: string, init: RequestInit = {}) {
    return fetch(url, {
      ...init,
      headers: this.headers(token),
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    })
  }
}
