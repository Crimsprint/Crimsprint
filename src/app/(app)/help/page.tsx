import { Screen } from '@/components/ui'

const FAQ = [
  ['How do lessons work?', 'Each lesson is 8 questions on one skill. Every answer gets an explanation right away. Questions you miss come back at the end of the lesson.'],
  ['What are mistakes left?', 'Each lesson allows 5 mistakes. Run out and the lesson ends, and you can start it again straight away.'],
  ['How do streaks work?', 'Finish at least one lesson a day to extend your streak. You earn a streak freeze at 7, 14, 30 and 50 days (you can hold 2), and one covers a single missed day automatically.'],
  ['What are leagues?', 'Each week you’re grouped with up to 30 learners. The top 7 by points move up a league and the bottom 5 move down. You can leave leagues any time.'],
  ['Is the mock test score official?', 'No. It is an estimate from our own questions and scoring model, not a College Board score.'],
  ['How do I keep my progress?', 'Everything is saved to your account. Log in with the same email on any device to pick up where you left off.'],
]

export default function HelpPage() {
  return (
    <Screen wide className="space-y-4">
      <h1 className="text-2xl font-bold">Help</h1>
      {FAQ.map(([q, a]) => (
        <details key={q} className="rounded-2xl border-2 border-border bg-surface p-4">
          <summary className="cursor-pointer font-semibold">{q}</summary>
          <p className="mt-2 text-text-muted">{a}</p>
        </details>
      ))}
    </Screen>
  )
}
