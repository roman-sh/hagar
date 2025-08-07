# Product Catalog Update Process

This document outlines the process for updating products in the Rexail catalog system, including both stock-managed and non-stock-managed items.

## API Endpoints

### Get Catalog
```
GET https://il.rexail.com/retailer/back-office/back-office/catalog/obfuscated/get
```

### Update Products
```
POST https://il.rexail.com/retailer/back-office/back-office/catalog/products/create-or-update
```

## Required Headers

Both endpoints require these essential headers:
```
origin: https://retailer-il.rexail.com
tarfash: [YOUR_AUTH_TOKEN]
```

The update endpoint also requires:
```
content-type: application/json;charset=UTF-8
```

**Note:** The `tarfash` header contains the authentication token and must be valid for the API calls to succeed.

## Update Process

### Step 1: Retrieve Catalog Data
First, fetch the current catalog to obtain the product details:

```bash
curl 'https://il.rexail.com/retailer/back-office/back-office/catalog/obfuscated/get' \
  -H 'origin: https://retailer-il.rexail.com' \
  -H 'tarfash: [YOUR_AUTH_TOKEN]'
```

### Step 2: Identify Target Product and Determine Update Path
From the catalog response, search for the product you want to update using data from the delivery invoice:

1. **Search by UPC Code (preferred method):**
   - Look for products where `product.upcCode` contains the barcode from your invoice
   - Note that UPC codes may be stored in two formats:
     - As a JSON array string: `"upcCode": "[\"7290015161626\"]"`
     - As a plain string: `"upcCode": "7290018757352"`

2. **Search by Product Name (alternative method):**
   - If UPC code is not available or not found, search by product name
   - Check all fields that might contain product name information:
     - `product.name`: Primary product name
     - `fullName`: Complete product name (often includes additional information like weight)
     - `secondaryName`: Alternative name or description (may be null)
   - Compare these fields against the product description from your invoice

3. **Check Current Stock Management Status:**
   - Examine the found product's `stockManaged` field:
     - If `stockManaged` is `false`, you'll need to follow the "Enabling Stock Management" path
     - If `stockManaged` is `true`, follow the "Updating Already-Managed Products" path

### Step 3: Prepare Update Payload
Construct a JSON payload with the following structure, based on the product's current stock management status:

```json
{
  "storeProductsForUpdate": [
    {
      // Product object with modifications according to appropriate update path
    }
  ],
  "childProductsForCreate": []
}
```

### Step 4: Send Update Request
Submit the update request:

```bash
curl 'https://il.rexail.com/retailer/back-office/back-office/catalog/products/create-or-update' \
  -H 'origin: https://retailer-il.rexail.com' \
  -H 'tarfash: [YOUR_AUTH_TOKEN]' \
  -H 'content-type: application/json;charset=UTF-8' \
  --data-raw '[YOUR_JSON_PAYLOAD]'
```

## Enabling Stock Management

**When to use this path**: For products where `stockManaged` is currently `false` and you want to enable inventory tracking.

Changes needed:

1. Set `stockManaged` to `true`
2. Set `currentQuantityInStock` to the desired inventory level
3. Set thresholds (typically to `0` if not used):
   - `stockRenewalThreshold`: `0`
   - `stockSellingThreshold`: `0`
4. Add `expandManageStock`: `true` to the payload
5. Add `newQuantityInStock`: `[value]` matching your current quantity
6. Add `edited`: `true` to indicate manual modification

Example of key fields in the update payload:
```json
{
  "stockManaged": true,
  "currentQuantityInStock": 1,
  "stockRenewalThreshold": 0,
  "stockSellingThreshold": 0,
  "expandManageStock": true,
  "edited": true,
  "newQuantityInStock": 1
}
```

## Updating Already-Managed Products

**When to use this path**: For products where `stockManaged` is already `true` and you only need to update the inventory count.

Changes needed:

1. Keep `stockManaged` as `true`
2. Update `currentQuantityInStock` to the new value
3. Include `newQuantityInStock` with the same value
4. Keep `edited` as `true`
5. The `expandManageStock` field is no longer needed

Example of key fields in the update payload:
```json
{
  "stockManaged": true,
  "currentQuantityInStock": 3,
  "stockRenewalThreshold": 0,
  "stockSellingThreshold": 0,
  "edited": true,
  "newQuantityInStock": 3
}
```

## Controlling Online Visibility

To show or hide a product in the online store, you must `POST` the **complete product object** to the `create-or-update` endpoint with specific boolean flags set. The server has two primary states:

1.  **To Make a Product VISIBLE:**
    The payload must contain these exact values:
    -   `"active": true`
    -   `"activeForOnline": true`
    -   `"excludedFromOnlineCatalog": false`
    -   `"hidden": false`

2.  **To HIDE a Product:**
    A product can be hidden from the online store by setting any of the following flags.
    -   **Method 1:** Set the master override.
        -   `"excludedFromOnlineCatalog": true`
    -   **Method 2:** Set the hidden flag.
        -   `"hidden": true`
    -   **Method 3:** Deactivate the product. **Both `active` and `activeForOnline` must be set to `false` together**, as the API requires them to be synchronized.
        -   `"active": false`
        -   `"activeForOnline": false`

**Key API Rules:**
-   The API requires the `active` and `activeForOnline` flags to always be identical. It will reject payloads where they differ.
-   The `hidden` flag also affects visibility but is less commonly used. For simplicity, it's best to rely on the three flags above.
-   **Do not** include the `edited` or `newQuantityInStock` fields when only changing visibility, as these are for stock updates.

## Notes

1. Always include the complete product object in the update; the API expects the full representation and will replace the entire product record
2. Be careful with price and stock changes as they will immediately affect the online store
3. Consider backing up the original product data before making significant changes
