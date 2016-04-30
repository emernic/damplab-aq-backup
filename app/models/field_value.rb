class FieldValue < ActiveRecord::Base

  belongs_to :sample
  belongs_to :child_sample, class_name: "Sample", foreign_key: :child_sample_id
  belongs_to :child_item, class_name: "Item", foreign_key: :child_item_id  

  attr_accessible :name, :child_item_id, :child_sample_id, :value

  def val

    fts = self.sample.sample_type.field_types.select { |ft| ft.name == self.name }

    if fts.length == 1

      case fts[0].ftype
      when 'string', 'url'
        return self.value
      when 'number'
        return self.value.to_f
      when 'sample'
        return self.child_sample
      when 'item'
        return self.child_item
      end

    else

      return nil

    end

  end

  def self.create_string sample, ft, vals
    vals.each do |v|
      if ft.choices && ft.choices != ""
        choices = ft.choices.split(",")
        unless choices.member? v
          sample.errors.add :choices, "#{v} is not a valid choice for #{ft.name}"
          raise ActiveRecord::Rollback                    
        end
      end
      fv = sample.field_values.create name: ft.name, value: v
      fv.save
    end
  end

  def self.create_number sample, ft, vals
    vals.each do |v|
      if ft.choices && ft.choices != ""
        choices = ft.choices.split(",").collect { |c| c.to_f }
        unless choices.member? v.to_f
          sample.errors.add :choices, "#{v} is not a valid choice for #{ft.name}"
          raise ActiveRecord::Rollback                    
        end
      end
      fv = sample.field_values.create name: ft.name, value: v.to_f
      fv.save
    end 
  end

  def self.create_url sample, ft, vals
    vals.each do |v|
      fv = sample.field_values.create name: ft.name, value: v
      fv.save
    end 
  end

  def self.create_sample sample, ft, vals

    vals.each do |v|

      if v.class == Sample
        child = v
      elsif v.class == Fixnum
        child = Sample.find_by_id(v)
        unless sample
          sample.errors.add :sample, "Could not find sample with id #{v} for #{ft.name}"
          raise ActiveRecord::Rollback  
        end
      else
        sample.errors.add :sample, "#{v} should be a sample for #{ft.name}"
        raise ActiveRecord::Rollback  
      end

      unless ft.allowed? child
        sample.errors.add :sample, "#{v} is not an allowable sample_type for #{ft.name}"
        raise ActiveRecord::Rollback
      end

      fv = sample.field_values.create name: ft.name, child_sample_id: child.id
      fv.save
    end  
  end

  def self.create_item sample, ft, vals
    vals.each do |v|
      if v.class == Item
        item = v
      elsif v.class == Fixnum
        item = Item.find(v)
        unless item
          sample.errors.add :item, "Could not find item with id #{v} for #{ft.name}"
          raise ActiveRecord::Rollback  
        end                
      else
        sample.errors.add :sample, "#{v} should be an item for #{ft.name}"
        raise ActiveRecord::Rollback  
      end    

      unless ft.allowed? child
        sample.errors.add :sample, "#{v} is not an allowable sample_type for #{ft.name}"
        raise ActiveRecord::Rollback
      end  

      fv = sample.field_values.create name: ft.name, child_item_id: sid
      fv.save
    end 
  end

  def self.creator sample, field_type, raw # sample, field_type, raw_field_data

    vals = []
    if field_type.array
      if raw.class != Array
        sample.errors.add :array, "#{field_type.name} should be an array."
        raise ActiveRecord::Rollback              
      end
      vals = raw
    else
      vals = [ raw ]
    end

    self.method("create_"+field_type.ftype).call(sample,field_type,vals)

  end

end 