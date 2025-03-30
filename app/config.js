import {
   SCAN_APPROVAL,
   DATA_EXTRACTION,
   DATA_APPROVAL,
   INVENTORY_UPDATE
} from './constants.js'

export const pipeline = [
   SCAN_APPROVAL,
   DATA_EXTRACTION,
   DATA_APPROVAL,
   INVENTORY_UPDATE
]
