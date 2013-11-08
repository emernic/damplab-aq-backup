module Plankton

  class Parser

    def simple_type
      if @tok.current == 'number' || @tok.current == 'string'
        return @tok.eat
      else
        raise "Expected 'number' or 'string' at '#{@tok.current}'"
      end
    end

    def optional_description
      if @tok.current == ','
        @tok.eat
        return @tok.eat_a_string.remove_quotes
      else
        return ""
      end
    end

    def optional_choices
      if @tok.current == ','
        @tok.eat
        choices = []
        @tok.eat_a '['
        while @tok.current != ']'
          choices.push( @tok.eat_a_string )
          if @tok.current == ','
            @tok.eat_a ','
          end
        end
        @tok.eat_a ']'
        return choices
      else
        return []
      end
    end

    def getdata

      getdatas = []

      @tok.eat_a 'getdata'

      while @tok.current != 'end'

        var =  @tok.eat_a_variable
               @tok.eat_a ':'

        type = simple_type
        description = optional_description
        choices = optional_choices
 
        if choices.length == 0
          getdatas.push( { getdata: { var: var, type: type, description: description } } )
        else
          getdatas.push ( { select: { var: var, type: type, description: description, choices: choices } } )
        end

      end

      @tok.eat_a 'end'

      return getdatas

    end # getdata

    def step

      parts = []      
      description = ''
      note = ''
      warnings = []

      @tok.eat_a 'step'

      while @tok.current != 'end'

        case @tok.current

          when 'description', 'note', 'warning'
            field = @tok.eat.to_sym
            @tok.eat_a ':'
            parts.push({ field => @tok.eat_a_string.remove_quotes})

          when 'getdata'
            parts.concat getdata

          else
            raise "Expect 'description', 'note', 'warning', 'getdata', or 'image' at '#{@tok.current}'."
         
        end

      end

      @tok.eat_a 'end'

      push StepInstruction.new parts

    end

  end

end
