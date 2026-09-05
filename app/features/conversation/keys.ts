export const conversationKeys = {
  list: (userId: string, page: number) => `private:${userId}:conversations:${page}`,
  detail: (userId: string, id: string) => `private:${userId}:conversation:${id}`,
}
