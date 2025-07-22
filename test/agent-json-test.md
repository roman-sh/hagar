# Agent JSON Manipulation Test

This file is designed to test an AI agent's ability to perform complex manipulations on a JSON object based on a set of natural language instructions.

## The Task

The agent should be given the "Prompt" and the "Input JSON" below. Its only output should be the final, mutated JSON object. We will then compare its output to the "Expected Output" to evaluate its performance.

---

## Prompt

You are an AI assistant. Your task is to modify a given JSON object according to a set of instructions. You must return only the final, valid JSON object, with no extra explanations.

Here are your instructions:
1.  For the item in row number 2, its `matchType` should be changed to `'manual'`. The `inventory_item_id` should be updated to `'prod_999'`, its `inventory_item_name` to `'בזיליקום פסטו טרי'`, and its `inventory_item_unit` to `'צנצנת'`. The `candidates` array for this item should be deleted.
2.  For the item in row number 3, it needs to be 'unmatched'. Set its `matchType` to `'none'`, and delete the `inventory_item_id`, `inventory_item_name`, `inventory_item_unit`, and `candidates` fields if they exist.
3.  For the item in row number 1, change its `quantity` to `'20'`.

Perform these mutations on the input JSON and return the complete, final JSON array.

---

## Input JSON

```json
[
  {
    "supplier_item_name": "חלב טרי 3%",
    "supplier_item_id": "7290000001",
    "quantity": "12",
    "unit_price": "5.80",
    "row_number": "1",
    "inventory_item_id": "prod_111",
    "inventory_item_name": "חלב טנובה 3% 1 ליטר",
    "inventory_item_unit": "יחידה",
    "matchType": "barcode"
  },
  {
    "supplier_item_name": "בזילקום טרי",
    "supplier_item_id": "7290000002",
    "quantity": "5",
    "unit_price": "4.50",
    "row_number": "2",
    "inventory_item_id": "prod_222",
    "inventory_item_name": "בזיליקום עלים טרי",
    "inventory_item_unit": "אריזה",
    "matchType": "vector",
    "candidates": [
      { "_id": "prod_222", "name": "בזיליקום עלים טרי", "score": 0.92 },
      { "_id": "prod_777", "name": "בזיליקום יבש", "score": 0.81 }
    ]
  },
  {
    "supplier_item_name": "ביצי חופש אורגניות L",
    "supplier_item_id": "7290000003",
    "quantity": "10",
    "unit_price": "14.00",
    "row_number": "3",
    "matchType": "none",
    "candidates": [
       { "_id": "prod_333", "name": "ביצי חופש L", "score": 0.88 },
       { "_id": "prod_444", "name": "ביצים אורגניות M", "score": 0.85 }
    ]
  }
]
```

---

## Expected Output

```json
[
  {
    "supplier_item_name": "חלב טרי 3%",
    "supplier_item_id": "7290000001",
    "quantity": "20",
    "unit_price": "5.80",
    "row_number": "1",
    "inventory_item_id": "prod_111",
    "inventory_item_name": "חלב טנובה 3% 1 ליטר",
    "inventory_item_unit": "יחידה",
    "matchType": "barcode"
  },
  {
    "supplier_item_name": "בזילקום טרי",
    "supplier_item_id": "7290000002",
    "quantity": "5",
    "unit_price": "4.50",
    "row_number": "2",
    "inventory_item_id": "prod_999",
    "inventory_item_name": "בזיליקום פסטו טרי",
    "inventory_item_unit": "צנצנת",
    "matchType": "manual"
  },
  {
    "supplier_item_name": "ביצי חופש אורגניות L",
    "supplier_item_id": "7290000003",
    "quantity": "10",
    "unit_price": "14.00",
    "row_number": "3",
    "matchType": "none"
  }
]
``` 