export const json = {
   stringify: (content: any) => {
      try { return JSON.stringify(content) }
      catch (e) { return content }
   },
   parse: (content: any) => {
      try { return JSON.parse(content) }
      catch (e) { return content }
   }
}