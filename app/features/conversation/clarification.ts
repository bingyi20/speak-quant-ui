import { clarificationData } from './agent-events'
import type {
  ClarificationData,
  ClarificationQuestion,
  DisplayMessage,
  MessageCard,
  StructuredAnswer,
} from './types'

export interface ClarificationGroup {
  messageId: string
  cards: { card: MessageCard; data: ClarificationData }[]
}
export function pendingClarification(messages: DisplayMessage[]): ClarificationGroup | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]!
    if (message.role === 'user' && !message.localPending) return null
    if (message.role !== 'assistant') continue
    const cards = message.cards.flatMap((card) => {
      const data = clarificationData(card)
      return data && !data.answered && card.status === 'waiting_user' ? [{ card, data }] : []
    })
    if (cards.length) return { messageId: message.id, cards }
  }
  return null
}
export type AnswerDrafts = Record<string, { mode: 'option' | 'custom'; text: string }>
export function validClarificationAnswer(
  question: ClarificationQuestion,
  draft?: AnswerDrafts[string],
) {
  const value = draft?.text.trim()
  return (
    !!value &&
    Array.from(value).length <= 2000 &&
    (draft!.mode === 'custom' ? question.allow_custom : question.options.includes(value))
  )
}
export function clarificationSubmission(group: ClarificationGroup, drafts: AnswerDrafts) {
  const answers: StructuredAnswer[] = []
  const lines: string[] = []
  for (const { data } of group.cards)
    for (const question of data.questions) {
      const draft = drafts[question.id]
      const value = draft?.text.trim()
      if (!value) continue
      if (!validClarificationAnswer(question, draft)) continue
      answers.push(
        draft!.mode === 'custom'
          ? { question_id: question.id, custom_text: value }
          : { question_id: question.id, value },
      )
      lines.push(`${question.question}\n${value}`)
    }
  if (new Set(answers.map((a) => a.question_id)).size !== answers.length) return null
  return {
    body: { reply_to_message_id: group.messageId, structured_answers: answers },
    display: lines.join('\n\n'),
  }
}
