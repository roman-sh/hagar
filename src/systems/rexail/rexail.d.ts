export interface RexailSellingUnit {
  id: number
  name: string
  conversionRateToKG: number | null
  weighable: boolean
}

export interface RexailPossibleSellingUnit {
  id: number
  sellingUnit: RexailSellingUnit
  estimatedUnitWeight: number | null
}

export interface RexailPrimaryQuantityUnit extends RexailSellingUnit {}

export interface RexailCategory {
  id: string
  name: string
  sortOrder: number
  parent: {
    sortOrder: number
  } | null
}

export interface RexailProductDetails {
  id: number
  name: string
  upcCode: string | null
  vatRate: number
  mainImageUrl: string
  possibleSellingUnits: RexailPossibleSellingUnit[]
  primaryQuantityUnit: RexailPrimaryQuantityUnit | null
}

export interface RexailProductQuality {
  id: number
  name: string
  sortOrder: number
  displayQuality: boolean
  defaultQuality: boolean
  imagePath: string
}

export interface RexailCountry {
  id: number
  name: string
  shortIdentifier: string
}

export interface RexailProduct {
  id: string
  nonObfuscatedId: number
  secondaryName: string | null
  fullName: string
  product: RexailProductDetails
  productCategory: RexailCategory
  additionalCategories: any[] // Assuming it's an array, but the sample is empty
  soldByWeight: boolean
  productQuality: RexailProductQuality
  genericProduct: boolean
  ancestor: any | null // Assuming it can be of any type, sample is null
  country: RexailCountry | null
  imageUrl: string
  imageDefinedByStore: boolean
  additionalImages: any | null // Assuming it can be of any type, sample is null
  productSellingUnits: RexailPossibleSellingUnit[]
  storeProductSellingUnitsJson: string
  price: number
  originalPrice: number | null
  retailerSortOrder: any | null
  active: boolean
  activeForOnline: boolean
  productExtraDetails: any | null
  productExternalId: string | null
  internalNotes: any | null
  internalPreparationNotes: any | null
  upcCode: string | null
  promoted: boolean
  hidden: boolean
  stockManaged: boolean
  reservedQuantityForOrders: number
  currentQuantityInStock: number
  stockRenewalThreshold: number
  stockSellingThreshold: number
  stockOnlineSellingThreshold: number
  supplier: any | null
  supplierPackageQuantity: any | null
  supplierDisplayedToClients: boolean
  crateComment: any | null
  productExternalAccountingId: any | null
  productExternalAccountingName: any | null
  currentRelevancy: any | null
  currentRelevancyFreeText: any | null
  excludedFromOnlineCatalog: boolean
  restaurantTargetedPrinter: any | null
  commentType: any | null
  excludedFromGeneralDiscount: boolean
  localizationJson: any | null
}

/**
 * Represents a product payload for updating an already stock-managed item.
 * It extends the base product and adds the additive stock quantity.
 */
export interface RexailManagedProductUpdate extends RexailProduct {
  quantityToAddToStock: number
}

/**
 * Represents a product payload for enabling stock management on an unmanaged item.
 * It extends the base product and sets the absolute new stock quantity.
 */
export interface RexailUnmanagedProductUpdate extends RexailProduct {
  stockManaged: true
  newQuantityInStock: number
}

export interface RexailObfuscatedCatalogResponse {
  success: boolean
  data: RexailProduct[]
}