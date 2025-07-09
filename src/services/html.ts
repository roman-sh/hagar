import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { InventoryDocument } from '../types/inventory'
import { InventoryConfirmation } from '../components/InventoryConfirmation'

export const html = {
   /**
    * Generates a user-friendly HTML document from the resolved inventory items.
    * @param doc The inventory document containing the resolved items and metadata.
    * @returns An HTML string.
    */
   generateInventoryConfirmation(doc: InventoryDocument): string {
      const component = React.createElement(InventoryConfirmation, { doc })
      return renderToStaticMarkup(component)
   }
}
