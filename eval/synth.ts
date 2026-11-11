// Invented identity cards for measuring photo reading. Everything here is made up: names from a short list, numbers
// generated (Aadhaar with a valid checksum), nothing resembling a real person. The layouts imitate the *roles* of the
// printed text on real cards (labels, values, header lines, a Devanagari line, a photo box, noise), not their exact
// design, so these numbers say how robust the reader is to photo quality, not how it does on every real layout.
import { verhoeffCheckDigit } from '../src/core/validators'
import type { DocTypeId } from '../src/rules/types'
import type { Fields } from './score'

export type Kind = 'aadhaar_front' | 'aadhaar_back' | 'pan' | 'driving_licence' | 'voter_id' | 'passport'
export const KINDS: Kind[] = ['aadhaar_front', 'aadhaar_back', 'pan', 'driving_licence', 'voter_id', 'passport']
export const DOC_OF: Record<Kind, DocTypeId> = { aadhaar_front: 'aadhaar', aadhaar_back: 'aadhaar', pan: 'pan', driving_licence: 'driving_licence', voter_id: 'voter_id', passport: 'passport' }

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export type Rng = () => number
const pick = <T,>(r: Rng, xs: T[]): T => xs[Math.floor(r() * xs.length)]!
const int = (r: Rng, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1))
const digits = (r: Rng, n: number) => Array.from({ length: n }, () => int(r, 0, 9)).join('')
const letters = (r: Rng, n: number) => Array.from({ length: n }, () => String.fromCharCode(65 + int(r, 0, 25))).join('')
const pad = (n: number) => String(n).padStart(2, '0')

const FIRST = ['ASHA', 'RAHUL', 'MEERA', 'KARTHIK', 'PRIYA', 'ARJUN', 'DIVYA', 'VIKRAM', 'ANITA', 'SURESH', 'LAKSHMI', 'IMRAN', 'NEHA', 'GURPREET']
const MID = ['KUMARI', 'KUMAR', 'LAL', 'DEVI', 'RAM']
const LAST = ['SHARMA', 'IYER', 'NAIR', 'PATEL', 'REDDY', 'GUPTA', 'MENON', 'SINGH', 'DAS', 'KHAN', 'JOSHI', 'VERMA']
const STREETS = ['MG ROAD', 'GANDHI NAGAR', 'TEMPLE STREET', 'LAKE VIEW COLONY', 'STATION ROAD', 'NEHRU ENCLAVE', 'GREEN PARK']
const CITIES: [string, string, string][] = [['MUMBAI', 'MAHARASHTRA', '400'], ['CHENNAI', 'TAMIL NADU', '600'], ['PUNE', 'MAHARASHTRA', '411'], ['BENGALURU', 'KARNATAKA', '560'], ['LUCKNOW', 'UTTAR PRADESH', '226'], ['JAIPUR', 'RAJASTHAN', '302']]
const STATE_CODE: Record<string, string> = { MAHARASHTRA: 'MH', 'TAMIL NADU': 'TN', KARNATAKA: 'KA', 'UTTAR PRADESH': 'UP', RAJASTHAN: 'RJ' }

export interface Person {
  name: string
  father: string
  dob: string
  aadhaar: string
  pan: string
  dl: string
  dlIssue: string
  dlExpiry: string
  epic: string
  passportNo: string
  passportExpiry: string
  given: string
  surname: string
  addressLines: string[]
  address: string
}

export function makePerson(seed: number): Person {
  const r = mulberry32(seed * 7919 + 13)
  const first = pick(r, FIRST)
  const mid = r() < 0.4 ? pick(r, MID) : ''
  const last = pick(r, LAST)
  const given = [first, mid].filter(Boolean).join(' ')
  const fatherFirst = pick(r, FIRST)
  const [city, state, pinPrefix] = pick(r, CITIES)
  const dobY = int(r, 1960, 2006)
  const dob = `${pad(int(r, 1, 28))}/${pad(int(r, 1, 12))}/${dobY}`
  const first11 = String(int(r, 2, 9)) + digits(r, 10)
  const issueY = int(r, 2012, 2024)
  const house = `${int(r, 1, 220)}, ${pick(r, STREETS)}`
  const area = pick(r, ['ANDHERI EAST', 'ADYAR', 'KOTHRUD', 'INDIRANAGAR', 'ALAMBAGH', 'MALVIYA NAGAR'])
  const pin = pinPrefix + digits(r, 3)
  const panDigits = digits(r, 4)
  return {
    name: `${given} ${last}`,
    father: `${fatherFirst} ${last}`,
    dob,
    aadhaar: first11 + verhoeffCheckDigit(first11),
    pan: `${letters(r, 3)}P${last[0]}${panDigits}${letters(r, 1)}`,
    dl: `${STATE_CODE[state]}${pad(int(r, 1, 49))}${issueY}${digits(r, 7)}`,
    dlIssue: `${pad(int(r, 1, 28))}-${pad(int(r, 1, 12))}-${issueY}`,
    dlExpiry: `${pad(int(r, 1, 28))}-${pad(int(r, 1, 12))}-${issueY + 20}`,
    epic: letters(r, 3) + digits(r, 7),
    passportNo: letters(r, 1) + String(int(r, 1, 9)) + digits(r, 6),
    passportExpiry: `${pad(int(r, 1, 28))}/${pad(int(r, 1, 12))}/${int(r, 2028, 2036)}`,
    given,
    surname: last,
    addressLines: [house, area, `${city}, ${state} - ${pin}`],
    address: [house, area, `${city}, ${state} - ${pin}`].join(', '),
  }
}

const W = 1000
const H = 630

function base(w = W, h = H, tint = '#fdfcf8') {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const x = c.getContext('2d')!
  x.fillStyle = tint
  x.fillRect(0, 0, w, h)
  return { c, x }
}

function photoBox(x: CanvasRenderingContext2D, left: number, top: number) {
  x.fillStyle = '#c9ced6'
  x.fillRect(left, top, 190, 230)
  x.fillStyle = '#9aa3af'
  x.beginPath()
  x.arc(left + 95, top + 90, 45, 0, Math.PI * 2)
  x.fill()
  x.fillRect(left + 40, top + 150, 110, 80)
}

function noiseBlocks(x: CanvasRenderingContext2D, r: Rng, left: number, top: number, size: number) {
  x.fillStyle = '#222'
  for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) if (r() < 0.5) x.fillRect(left + i * (size / 12), top + j * (size / 12), size / 12, size / 12)
}

export interface Sample {
  kind: Kind
  canvas: HTMLCanvasElement
  truth: Fields
}

export function drawCard(kind: Kind, p: Person, r: Rng): Sample {
  const grouped = p.aadhaar.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3')
  switch (kind) {
    case 'aadhaar_front': {
      const { c, x } = base()
      x.fillStyle = '#e8772e'
      x.fillRect(0, 0, W, 14)
      x.fillStyle = '#1b7a3e'
      x.fillRect(0, H - 14, W, 14)
      x.fillStyle = '#111'
      x.font = 'bold 26px Arial'
      x.fillText('भारत सरकार', 360, 60)
      x.font = 'bold 24px Arial'
      x.fillText('Government of India', 350, 95)
      photoBox(x, 40, 150)
      x.font = '26px Arial'
      x.fillText('आशा कुमारी', 270, 230)
      x.font = 'bold 32px Arial'
      x.fillText(p.name, 270, 280)
      x.font = '28px Arial'
      x.fillText(`DOB: ${p.dob}`, 270, 330)
      x.fillText(pick(r, ['MALE', 'FEMALE']), 270, 375)
      x.font = 'bold 54px Arial'
      x.fillText(grouped, 250, 510)
      x.font = '20px Arial'
      x.fillText('Mera Aadhaar, Meri Pehchaan', 330, 590)
      return { kind, canvas: c, truth: { name: p.name, dob: p.dob, number: p.aadhaar } }
    }
    case 'aadhaar_back': {
      const { c, x } = base()
      x.fillStyle = '#e8772e'
      x.fillRect(0, 0, W, 14)
      x.fillStyle = '#111'
      x.font = 'bold 26px Arial'
      x.fillText('Unique Identification Authority of India', 200, 70)
      x.font = '28px Arial'
      x.fillText('Address:', 60, 150)
      p.addressLines.forEach((l, i) => x.fillText(i === 0 ? `S/O: ${p.father}, ${l}` : l, 60, 195 + i * 42))
      x.font = 'bold 50px Arial'
      x.fillText(grouped, 250, 450)
      x.font = '24px Arial'
      x.fillText('VID: 9182 3746 5501 2837', 290, 510)
      x.fillText('help@uidai.gov.in    www.uidai.gov.in', 250, 585)
      noiseBlocks(x, r, 780, 130, 150)
      return { kind, canvas: c, truth: { address: [`S/O: ${p.father}, ${p.addressLines[0]}`, ...p.addressLines.slice(1)].join(', ') } }
    }
    case 'pan': {
      const { c, x } = base(W, H, '#e9eef7')
      x.fillStyle = '#111'
      x.font = 'bold 28px Arial'
      x.fillText('आयकर विभाग        भारत सरकार', 150, 60)
      x.fillText('INCOME TAX DEPARTMENT    GOVT. OF INDIA', 100, 100)
      x.font = '22px Arial'
      x.fillText('Permanent Account Number Card', 280, 150)
      x.font = 'bold 44px Arial'
      x.fillText(p.pan, 60, 220)
      x.font = '22px Arial'
      x.fillText('नाम / Name', 60, 280)
      x.font = 'bold 30px Arial'
      x.fillText(p.name, 60, 320)
      x.font = '22px Arial'
      x.fillText("पिता का नाम / Father's Name", 60, 375)
      x.font = 'bold 30px Arial'
      x.fillText(p.father, 60, 415)
      x.font = '22px Arial'
      x.fillText('जन्म की तारीख / Date of Birth', 60, 470)
      x.font = 'bold 30px Arial'
      x.fillText(p.dob, 60, 510)
      photoBox(x, 760, 230)
      return { kind, canvas: c, truth: { number: p.pan, name: p.name, fatherName: p.father, dob: p.dob } }
    }
    case 'driving_licence': {
      const { c, x } = base(W, H, '#f3f6ee')
      x.fillStyle = '#111'
      x.font = 'bold 28px Arial'
      x.fillText('Indian Union Driving Licence', 250, 55)
      x.font = '26px Arial'
      x.fillText(`DL No: ${p.dl.slice(0, 4)} ${p.dl.slice(4)}`, 50, 120)
      x.fillText(`Issue Date: ${p.dlIssue}`, 50, 170)
      x.fillText(`Validity (NT): ${p.dlExpiry}`, 50, 215)
      x.fillText(`Name: ${p.name}`, 50, 280)
      x.fillText(`DOB: ${p.dob.replace(/\//g, '-')}`, 50, 325)
      x.fillText(`S/D/W of: ${p.father}`, 50, 370)
      x.fillText('Address:', 50, 425)
      p.addressLines.forEach((l, i) => x.fillText(l, 50, 465 + i * 38))
      photoBox(x, 770, 250)
      return { kind, canvas: c, truth: { number: p.dl, issueDate: p.dlIssue, expiryDate: p.dlExpiry, name: p.name, dob: p.dob, address: p.address } }
    }
    case 'voter_id': {
      const { c, x } = base(W, H, '#fbeaea')
      x.fillStyle = '#111'
      x.font = 'bold 26px Arial'
      x.fillText('भारत निर्वाचन आयोग', 330, 55)
      x.fillText('ELECTION COMMISSION OF INDIA', 260, 95)
      x.font = '22px Arial'
      x.fillText('IDENTITY CARD', 400, 130)
      x.font = 'bold 36px Arial'
      x.fillText(p.epic, 60, 200)
      x.font = '26px Arial'
      x.fillText(`Elector's Name: ${p.name}`, 60, 280)
      x.fillText(`Father's Name: ${p.father}`, 60, 330)
      x.fillText(`Date of Birth: ${p.dob}`, 60, 380)
      x.fillText(pick(r, ['Sex: Male', 'Sex: Female']), 60, 430)
      photoBox(x, 770, 200)
      return { kind, canvas: c, truth: { number: p.epic, name: p.name, dob: p.dob } }
    }
    case 'passport': {
      const { c, x } = base(W, 700, '#f4f0e6')
      x.fillStyle = '#111'
      x.font = 'bold 22px Arial'
      x.fillText('Republic of India', 380, 45)
      x.font = '20px Arial'
      x.fillText('Type', 280, 100)
      x.fillText('Country Code', 400, 100)
      x.fillText('Passport No.', 640, 100)
      x.font = 'bold 28px Arial'
      x.fillText('P', 280, 135)
      x.fillText('IND', 400, 135)
      x.fillText(p.passportNo, 640, 135)
      photoBox(x, 50, 90)
      x.font = '20px Arial'
      x.fillText('Surname', 280, 190)
      x.font = 'bold 28px Arial'
      x.fillText(p.surname, 280, 225)
      x.font = '20px Arial'
      x.fillText('Given Name(s)', 280, 275)
      x.font = 'bold 28px Arial'
      x.fillText(p.given, 280, 310)
      x.font = '20px Arial'
      x.fillText('Date of Birth', 280, 360)
      x.fillText('Sex', 560, 360)
      x.font = 'bold 28px Arial'
      x.fillText(p.dob, 280, 395)
      x.fillText('F', 560, 395)
      x.font = '20px Arial'
      x.fillText('Date of Expiry', 280, 445)
      x.font = 'bold 28px Arial'
      x.fillText(p.passportExpiry, 280, 480)
      x.font = '26px monospace'
      x.fillText(`P<IND${p.surname}<<${p.given.replace(/ /g, '<')}<<<<<<<<<<<`, 40, 600)
      x.fillText(`${p.passportNo}<8IND${p.dob.slice(-2)}<<<<<<<<<<<<<<<<<<<<<<<<<<04`, 40, 640)
      return { kind, canvas: c, truth: { number: p.passportNo, name: `${p.given} ${p.surname}`, dob: p.dob, expiryDate: p.passportExpiry } }
    }
  }
}
