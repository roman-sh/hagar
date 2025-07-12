import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { InventoryDocument } from '../types/inventory.js'
import { InventoryConfirmation } from '../components/InventoryConfirmation.js'
import puppeteer from 'puppeteer'
import logoBase64 from '../assets/hagar-fluid.png?url'

export const html = {
	/**
	 * Generates a PDF document from the resolved inventory items.
	 * @param doc The inventory document containing the resolved items and metadata.
	 * @returns A Promise that resolves to a Buffer containing the PDF data.
	 */
	async generateInventoryConfirmation(doc: InventoryDocument): Promise<Buffer> {
		const component = React.createElement(InventoryConfirmation, { doc, logoBase64 })
		const staticMarkup = renderToStaticMarkup(component)
		const htmlWithDoctype = `<!DOCTYPE html>${staticMarkup}`

		const browser = await puppeteer.launch({
			headless: true,
		})
		const page = await browser.newPage()

		await page.setContent(htmlWithDoctype, { waitUntil: 'networkidle0' })

		const pdfBuffer = await page.pdf({
			format: 'A4',
			printBackground: true,
		})

		await browser.close()
		return pdfBuffer
	},
}
