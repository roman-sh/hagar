export const json = {
   
   stringify: (content: any) => 
      typeof content === 'string' ? content : JSON.stringify(content),

   parse: (content: any) => {
      try { return JSON.parse(content) }
      catch (e) { return content }
   }
} 