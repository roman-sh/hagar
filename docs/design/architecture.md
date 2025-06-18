HaOrgani WhatsApp Bot Flow - Technical Details
============================================

0. AUTHENTICATION
---------------
A. Catalog Endpoint:
   - No authentication needed
   - Random device-id sufficient
   - Just origin validation

B. Cart Creation (shared-cart):
   - Same as catalog - no auth needed
   - Random device-id works
   - Creates shareable cart
   - User will authenticate when opening cart link in browser
   - At that point, their browser's localStorage will contain:
     ```
     auth: {
         "deviceId": "af1f06399d7bb48fcc15f1f84418cac6",
         "jweToken": "eyJhbGciOiJk..."
     }
     ```


1. CATALOG MANAGEMENT
-------------------
Endpoint: https://client-il.rexail.com/client/public/store/catalog

Headers:
- accept: application/json
- device-id: [random-id]  // Can be any random string
- origin: https://shop.haorgani.co.il
- referer: https://shop.haorgani.co.il/
- x-source-platform: Retailer-Website
- x-website: eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..jDl_TC89rzj3Pb9ljy3FwA.fhyNZFB0OQdx1mEhN7PngORfoxQVg3kppPnExJJwMeWM-uX53PxUh9ygZb5nI3QHgTER3deyTkoIinjls8Vf4zeFz4ak80C8Mu-m97ybkyZNQB0lVA6tFNqwoHkLf84m.eAFQx2BWEmgrNkYYRn6qeA

2. DATABASE (CouchDB)
------------------
A. Design Document:
{
  "views": {
    "by_searchable_name": {
      "map": function(doc) {
        if (doc.type === 'product') {
          var name = doc.name;
          var words = name.split(' ');
          words.forEach(word => emit(word, doc));
        }
      }
    }
  },
  "fulltext": {
    "products": {
      "index": function(doc) {
        if (doc.type === 'product') {
          var ret = new Document();
          ret.add(doc.name, {"field": "name", "analyzer": "hebrew"});
          ret.add(doc.category, {"field": "category", "analyzer": "hebrew"});
          ret.add(doc.id.toString(), {"field": "id"});
          return ret;
        }
        return null;
      }
    }
  }
}

B. Document Structure:
{
  "_id": "product_155046",
  "type": "product",
  "lastUpdated": "2024-02-12T01:54:58Z",
  "data": {
    "id": 155046,
    "obfuscatedId": "Ik2NlC88SU-KvhyOlFA4f9-ynjXf4YrAcJuHy8fezxqB2DTFAnbnbJ1XHlqkGLZe",
    "fullName": "אבקת אפייה אורגנית (4 שקיות) - Lecker's, אורגני",
    "product": {
      "id": 1279,
      "name": "אבקת אפייה\nLecker's",
      "sortOrder": 1272,
      "primaryQuantityUnit": null,
      "defaultSellingUnit": null,
      "limitedByAge": false,
      "liquid": false,
      "multiLangJson": "{\"en\":{\"name\":\"Baking Powder - Lecker's\"}}"
    },
    "productCategory": {
      "id": 4428,
      "name": "בישול, קמחים ואפיה",
      "sortOrder": 17,
      "parent": {
        "id": 4301,
        "name": "המזווה",
        // ... parent category data
      }
    },
    "soldByWeight": false,
    "activeForOnline": true,
    "productQuality": {
      "id": 3,
      "name": "אורגני",
      "displayQuality": true,
      "imagePath": "images/product-qualities//85c7c7272ca90973b340c75ea6af187c.png",
      "multiLangJson": "{\"en\":{\"name\":\"Organic\"}}"
    },
    "price": 8.7,
    "productSellingUnits": [
      {
        "id": 2749,
        "sellingUnit": {
          "id": 6,
          "name": "מארז",
          "sortOrder": 8,
          "amountJumps": 1.0,
          "multiLangJson": "{\"en\":{\"name\":\"Package\"}}"
        },
        "maxAmount": 10
      }
    ],
    "secondaryName": "אבקת אפייה אורגנית (4 שקיות) - Lecker's",
    "productExtraDetails": "אבקת אפייה אורגנית ללא פוספטים, 21 גרם לשקית, 4 שקיות."
  }
}

C. Search Query:
GET /dbname/_fti/products?q=name:קשיו

3. UPDATE FLOW
------------
1. On every user message:
   - Check last catalog update timestamp
   - If > 1 hour old, fetch new catalog

2. Catalog Update Process:
   - Fetch catalog using headers above
   - Parse response
   - For each product:
     * Create/update CouchDB document
     * Lucene index updates automatically
   - Store update timestamp

4. CHAT FLOW
-----------
1. User sends product query
2. Search products using Lucene
3. Format and show matches
4. Build cart with selected items

5. CART CREATION
--------------
Endpoint: https://client-il.rexail.com/client/client/shared-cart

Headers: Same as catalog request

Request Body:
{
    "contentItems": [
        {
            "storeProduct": {
                "id": 185593
            },
            "requestedQuantity": 1,
            "requestedSellingUnit": {
                "id": 12957
            }
        }
    ]
}

Response:
{
    "success": true,
    "data": "Is3wpUy88-dPoeLcHBrP8k2YniK2JRrix-kGu37r2wo=",
    "failureData": null,
    "code": "successLocalized"
}

6. CHECKOUT LINK
--------------
Format: https://shop.haorgani.co.il?share_cart=[cartId]

Example:
https://shop.haorgani.co.il?share_cart=Is3wpUy88-dPoeLcHBrP8k2YniK2JRrix-kGu37r2wo=

Send to user in WhatsApp message for completion of purchase.