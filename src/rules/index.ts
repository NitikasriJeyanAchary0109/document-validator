import type { Service, ServiceCategory } from './types'
import { drivingLicence } from './services/driving-licence'
import { learnerLicence } from './services/learner-licence'
import { licenceRenewal } from './services/licence-renewal'
import { ownershipTransfer } from './services/ownership-transfer'
import { passportFresh } from './services/passport-fresh'
import { passportMinor } from './services/passport-minor'
import { passportReissue } from './services/passport-reissue'
import { vehicleRegistration } from './services/vehicle-registration'

export const SERVICES: Service[] = [
  learnerLicence,
  drivingLicence,
  licenceRenewal,
  vehicleRegistration,
  ownershipTransfer,
  passportFresh,
  passportReissue,
  passportMinor,
]

export const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  rto: 'Driving licence and vehicle (RTO)',
  passport: 'Passport',
}

export const getService = (id: string): Service | undefined => SERVICES.find((s) => s.id === id)
