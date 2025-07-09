import React from 'react'
import { InventoryDocument, InventoryItem } from '../types/inventory'

interface InventoryConfirmationProps {
   doc: InventoryDocument
}

const getRowClass = (item: InventoryItem): string => {
   switch (item.match_type) {
      case 'barcode':
         return 'table-success'
      case 'vector':
      case 'barcode-collision':
         return 'table-warning'
      default:
         return 'table-danger'
   }
}

const groupByPage = (items: InventoryItem[]): Record<string, InventoryItem[]> => {
   return items.reduce((acc, item) => {
      const page = item.pageNumber || 1
      if (!acc[page]) {
         acc[page] = []
      }
      acc[page].push(item)
      return acc
   }, {} as Record<string, InventoryItem[]>)
}

export const InventoryConfirmation: React.FC<InventoryConfirmationProps> = ({ doc }) => {
   const { invoiceId, supplier, date } = doc.meta
   const groupedItems = groupByPage(doc.items)

   return (
      <html lang="he" dir="rtl">
         <head>
            <meta charSet="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>אישור קליטת סחורה</title>
            <link
               rel="stylesheet"
               href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css"
               integrity="sha384-T3c6CoIi6uLrA9TneNEoa7RxnatzjcDSCmG1MXxSR1GAsXEV/Dwwykc2MPK8M2HN"
               crossOrigin="anonymous"
            />
            <style>
               {`
                  body { padding: 15px; }
                  .table { direction: rtl; }
                  h1, h2, p { margin: 5px 0; }
               `}
            </style>
         </head>
         <body>
            <div className="container">
               <h1>אישור קליטת סחורה</h1>
               <p><b>מסמך:</b> {invoiceId}</p>
               <p><b>ספק:</b> {supplier}</p>
               <p><b>תאריך:</b> {date}</p>

               {Object.entries(groupedItems).map(([pageNumber, items]) => (
                  <div key={pageNumber}>
                     <h2 className="mt-4">עמוד {pageNumber}</h2>
                     <table className="table table-bordered table-striped">
                        <thead>
                           <tr>
                              <th>פריט ספק</th>
                              <th>פריט במלאי</th>
                              <th>אופן התאמה</th>
                           </tr>
                        </thead>
                        <tbody>
                           {items.map((item, index) => (
                              <tr key={index} className={getRowClass(item)}>
                                 <td>{item.supplier_item_name || ''}</td>
                                 <td>{item.inventory_item_name || ''}</td>
                                 <td>{item.match_type || 'לא נמצא'}</td>
                              </tr>
                           ))}
                        </tbody>
                     </table>
                  </div>
               ))}
            </div>
         </body>
      </html>
   )
} 