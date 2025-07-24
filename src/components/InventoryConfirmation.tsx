import React from 'react'
import { InventoryDocument, InventoryItem } from '../types/inventory'
import { DISPLAY_HEADERS, H } from '../config/constants'
import cssContent from './InventoryConfirmation.css?raw'

// Configuration for layout
const DENSE_LAYOUT_ITEM_THRESHOLD = 20
const SUPER_DENSE_LAYOUT_ITEM_THRESHOLD = 40

interface InventoryConfirmationProps {
	doc: InventoryDocument
}

const getRowStyle = (item: InventoryItem): React.CSSProperties => {
	let borderColor = ''
	switch (item.match_type) {
		case 'barcode':
		case 'manual':
			borderColor = '#198754' // Success
			break
		case 'name':
			borderColor = '#ffc107' // Warning
			break
		case 'skip':
			borderColor = 'transparent'
			break
		default:
			borderColor = '#dc3545' // Danger
			break
	}
	return {
		borderRight: `4px solid ${borderColor}`,
	}
}

const groupByPage = (items: InventoryItem[]): Record<string, InventoryItem[]> => {
	return items.reduce(
		(acc, item) => {
			const page = item[H.PAGE_NUMBER]
			if (!acc[page]) {
				acc[page] = []
			}
			acc[page].push(item)
			return acc
		},
		{} as Record<string, InventoryItem[]>
	)
}

export const InventoryConfirmation: React.FC<InventoryConfirmationProps> = ({
	doc,
}) => {
	const { invoiceId, supplier, date } = doc.meta
	const groupedItems = groupByPage(doc.items)

	// Check if any page is dense enough to warrant a compact header
	const isDense = Object.values(groupedItems).some(
		items => items.length > DENSE_LAYOUT_ITEM_THRESHOLD
	)

	return (
		<html lang="he" dir="rtl">
			<head>
				<meta charSet="UTF-8" />
				<title>אישור קליטת סחורה</title>
				<link
					rel="stylesheet"
					href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css"
					integrity="sha384-T3c6CoIi6uLrA9TneNEoa7RxnatzjcDSCmG1MXxSR1GAsXEV/Dwwykc2MPK8M2HN"
					crossOrigin="anonymous"
				/>
				<link rel="preconnect" href="https://fonts.googleapis.com" />
				<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
				<link
					href="https://fonts.googleapis.com/css2?family=Heebo:wght@300&family=Rubik:wght@500&family=Assistant:wght@400;700&family=Arimo&display=swap"
					rel="stylesheet"
				/>
				<style>{cssContent}</style>
			</head>
			<body>
				{Object.entries(groupedItems).map(([pageNumber, items]) => {
					const isSuperDense = items.length > SUPER_DENSE_LAYOUT_ITEM_THRESHOLD
					return (
						<div
							key={pageNumber}
							className={`page ${isSuperDense ? 'page-super-dense' : ''}`}
						>
							<header className="page-header">
								{isDense ? (
									<div className="meta-info-dense">
										<p>
											<b>מסמך:</b> {invoiceId}
										</p>
										<p>
											<b>ספק:</b> {supplier}
										</p>
										<p>
											<b>תאריך:</b> {date}
										</p>
									</div>
								) : (
									<div className="meta-info">
										<h3 className="main-title">טיוטת עדכון מלאי</h3>
										<p>
											<b>מסמך:</b> {invoiceId}
										</p>
										<p>
											<b>ספק:</b> {supplier}
										</p>
										<p>
											<b>תאריך:</b> {date}
										</p>
									</div>
								)}
								<div className="separator" />
							</header>

							<main className="table-container">
								<table className="table table-borderless">
									<thead>
										<tr>
											<th>{DISPLAY_HEADERS[H.ROW_NUMBER]}</th>
											<th>{DISPLAY_HEADERS[H.SUPPLIER_ITEM_NAME]}</th>
											<th>{DISPLAY_HEADERS[H.INVENTORY_ITEM_NAME]}</th>
											<th>{DISPLAY_HEADERS[H.QUANTITY]}</th>
										</tr>
									</thead>
									<tbody>
										{items.map((item, itemIndex) => (
											<tr key={itemIndex} style={getRowStyle(item)}>
												<td>{item[H.ROW_NUMBER]}</td>
												<td className="truncate-text">
													{item[H.SUPPLIER_ITEM_NAME] || ''}
												</td>
												<td className="truncate-text">
													{item[H.INVENTORY_ITEM_NAME] || ''}
												</td>
												<td>{item[H.QUANTITY]}</td>
											</tr>
										))}
									</tbody>
								</table>
							</main>
						</div>
					)
				})}
			</body>
		</html>
	)
} 