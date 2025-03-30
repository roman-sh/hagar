import {
   SCAN_APPROVAL,
   DATA_EXTRACTION,
   DATA_APPROVAL,
   INVENTORY_UPDATE
} from './constants.js'

import {
   scanApprovalProcessor,
   dataExtractionProcessor,
   dataApprovalProcessor,
   inventoryUpdateProcessor
} from './processors/index.js'

export const processors = {
   [SCAN_APPROVAL]: scanApprovalProcessor,
   [DATA_EXTRACTION]: dataExtractionProcessor,
   [DATA_APPROVAL]: dataApprovalProcessor,
   [INVENTORY_UPDATE]: inventoryUpdateProcessor
}
